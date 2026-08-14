/**
 * meta-webhook — Instagram / Facebook Messenger events
 *
 * Workspace resolution:
 *   Meta page_id / Instagram account_id
 *   → channels.settings.page_id / instagram_account_id
 *   → ONE channel → workspace_id
 *   NEVER: workspaces.owner_id = senderId (invalid — external IDs ≠ Supabase UUIDs)
 *
 * Idempotency:
 *   INSERT processed_webhook_events(provider, event_id) BEFORE side effects
 *   UNIQUE conflict = already_processed → skip with 200
 *   No SELECT+INSERT race — atomic claim
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { verifyMetaSignature } from "../_shared/webhook-signatures.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });
const rateLimitMap = new Map<string, { n: number; t: number }>();
function checkRL(k: string): boolean {
  const now = Date.now();
  const e = rateLimitMap.get(k);
  if (!e || now > e.t) { rateLimitMap.set(k, { n: 1, t: now + 60000 }); return true; }
  if (e.n >= 200) return false; e.n++; return true;
}

/** Atomic idempotency claim — BEFORE any side effects */
async function claimEvent(
  sb: ReturnType<typeof createClient>,
  provider: string,
  eventId: string,
  workspaceId?: string,
): Promise<"claimed" | "duplicate" | "error"> {
  const { error } = await sb.from("processed_webhook_events")
    .insert({ provider, event_id: `${provider}:${eventId}`, workspace_id: workspaceId ?? null });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";  // UNIQUE constraint = already processed
  return "error";
}

/** Resolve workspace from Meta page_id or Instagram account_id.
 *  NEVER resolves from sender_id — sender IDs are external provider IDs, not Supabase UUIDs. */
async function resolveWorkspaceFromPage(
  sb: ReturnType<typeof createClient>,
  pageId: string,
  platform: "instagram" | "facebook",
): Promise<{ workspace_id: string; channel_id: string } | null> {
  const { data: channels } = await sb
    .from("channels")
    .select("id, workspace_id, settings")
    .in("channel_type", platform === "instagram" ? ["instagram"] : ["facebook", "messenger"])
    .eq("is_enabled", true);

  if (!channels?.length) return null;

  for (const ch of channels) {
    const s = (ch.settings as any) ?? {};
    const storedPageId     = s.page_id            ?? s.facebook_page_id ?? null;
    const storedAccountId  = s.instagram_account_id ?? s.ig_account_id  ?? null;
    if (
      (storedPageId    && storedPageId    === pageId) ||
      (storedAccountId && storedAccountId === pageId)
    ) {
      return { workspace_id: ch.workspace_id, channel_id: ch.id };
    }
  }
  return null;  // No match — caller must skip
}

serve(async (req) => {
  // GET — webhook verification challenge
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const vt = Deno.env.get("META_VERIFY_TOKEN");
    if (mode === "subscribe" && token === vt && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "meta";
  if (!checkRL(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429,
      headers: { ...getCors(req), "Content-Type": "application/json" } });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const rawBody = await req.text();

    // FAIL-CLOSED: signature verification — 503 on unconfigured, 403 on invalid
    const sigCheck = await verifyMetaSignature(
      rawBody, req.headers.get("x-hub-signature-256"), "META_APP_SECRET",
    );
    if (!sigCheck.ok) {
      const sc = sigCheck.reason === "secret_not_configured" ? 503 : 403;
      return new Response(JSON.stringify({ error: sigCheck.reason }), {
        status: sc, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const body       = JSON.parse(rawBody);
    const objectType = body?.object as string;  // "instagram" | "page"
    const entries    = body?.entry ?? [];
    let processed = 0;

    for (const entry of entries) {
      const pageId = entry.id as string;  // Instagram account ID or Facebook Page ID
      if (!pageId) continue;

      // ── Instagram DMs ─────────────────────────────────────────────────────
      if (objectType === "instagram") {
        const ws = await resolveWorkspaceFromPage(sb, pageId, "instagram");
        if (!ws) {
          console.warn(`[META] No workspace for Instagram account ${pageId} — skipping`);
          continue;  // zero side effects
        }

        const messaging = (entry?.messaging ?? []) as any[];
        for (const event of messaging) {
          if (!event?.message) continue;

          const msgId = event.message?.mid ?? `${pageId}:${event.timestamp ?? Date.now()}`;

          // ATOMIC claim BEFORE any side effects
          const claim = await claimEvent(sb, "meta_ig", msgId, ws.workspace_id);
          if (claim === "duplicate") continue;
          if (claim === "error") {
            console.error("[META-IG] Claim failed for", msgId);
            continue;
          }

          const senderId   = event.sender?.id as string;
          const msgText    = event.message?.text ?? "";
          const attachments = event.message?.attachments ?? [];
          const content    = msgText || (attachments.length ? "[attachment]" : "");
          if (!content) continue;

          // Store inbox message (workspace_id from channel, not sender)
          const { data: inboxMsg } = await sb.from("inbox_messages").insert({
            workspace_id:       ws.workspace_id,
            channel_id:         ws.channel_id,
            channel_type:       "instagram",
            source_name:        "Instagram",
            sender_name:        senderId,
            sender_identifier:  senderId,
            message_content:    content,
            message_timestamp:  new Date().toISOString(),
            direction:          "inbound",
            status:             "received",
            delivery_status:    "delivered",
            is_unread:          true,
            provider_message_id: msgId,
            metadata:           { page_id: pageId, sender_id: senderId },
          }).select("id").single().catch(() => ({ data: null }));

          // Upsert lead by sender+workspace
          const { data: lead } = await sb.from("leads").upsert({
            workspace_id:       ws.workspace_id,
            channel_type:       "instagram",
            contact_identifier: senderId,
            source_type:        "instagram",
            status:             "new",
          }, { onConflict: "workspace_id,contact_identifier" }).select("id").single()
            .catch(() => ({ data: null }));

          // Customer Brain: non-financial message activity
          if (lead?.id) {
            fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
              },
              body: JSON.stringify({
                action: "feedback",
                workspace_id: ws.workspace_id,
                lead_id:      lead.id,
                event_type:   "replied",
                channel:      "instagram",
                event_data:   { msg_id: msgId, page_id: pageId },
              }),
            }).catch(() => {});
          }

          processed++;
        }
      }

      // ── Facebook Messenger ────────────────────────────────────────────────
      else if (objectType === "page") {
        const ws = await resolveWorkspaceFromPage(sb, pageId, "facebook");
        if (!ws) {
          console.warn(`[META] No workspace for Facebook page ${pageId} — skipping`);
          continue;
        }

        const messaging = (entry?.messaging ?? []) as any[];
        for (const event of messaging) {
          if (!event?.message) continue;

          const msgId = event.message?.mid ?? `${pageId}:${event.timestamp ?? Date.now()}`;

          const claim = await claimEvent(sb, "meta_fb", msgId, ws.workspace_id);
          if (claim !== "claimed") continue;

          const senderId = event.sender?.id as string;
          const msgText  = event.message?.text ?? "";
          if (!msgText) continue;

          await sb.from("inbox_messages").insert({
            workspace_id:       ws.workspace_id,
            channel_id:         ws.channel_id,
            channel_type:       "facebook",
            source_name:        "Facebook Messenger",
            sender_name:        senderId,
            sender_identifier:  senderId,
            message_content:    msgText,
            message_timestamp:  new Date().toISOString(),
            direction:          "inbound",
            status:             "received",
            is_unread:          true,
            provider_message_id: msgId,
            metadata:           { page_id: pageId, sender_id: senderId },
          }).catch(() => {});

          const { data: lead } = await sb.from("leads").upsert({
            workspace_id:       ws.workspace_id,
            channel_type:       "facebook",
            contact_identifier: senderId,
            source_type:        "facebook",
            status:             "new",
          }, { onConflict: "workspace_id,contact_identifier" }).select("id").single()
            .catch(() => ({ data: null }));

          if (lead?.id) {
            fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
              },
              body: JSON.stringify({
                action: "feedback",
                workspace_id: ws.workspace_id,
                lead_id:      lead.id,
                event_type:   "replied",
                channel:      "facebook",
                event_data:   { msg_id: msgId, page_id: pageId },
              }),
            }).catch(() => {});
          }

          processed++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[META-WEBHOOK] error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
