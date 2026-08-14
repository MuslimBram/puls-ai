/**
 * whatsapp-webhook — WhatsApp Cloud API events
 *
 * Workspace resolution: requires exact phone_number_id match in channels.settings.
 * REMOVED: fallback to first-enabled channel when phone_number_id is missing.
 *
 * Zero/ambiguous mapping → quarantine event, no side effects.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { verifyMetaSignature } from "../_shared/webhook-signatures.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });
const rlMap = new Map<string, { n: number; t: number }>();
function checkRL(k: string): boolean {
  const now = Date.now();
  const e = rlMap.get(k);
  if (!e || now > e.t) { rlMap.set(k, { n: 1, t: now + 60000 }); return true; }
  if (e.n >= 200) return false; e.n++; return true;
}

/** Atomic idempotency: INSERT returning id; conflict = duplicate */
async function claimEvent(
  sb: ReturnType<typeof createClient>,
  provider: string,
  eventId: string,
  workspaceId: string,
): Promise<"claimed" | "duplicate" | "error"> {
  const { error } = await sb.from("processed_webhook_events")
    .insert({ provider, event_id: `${provider}:${eventId}`, workspace_id: workspaceId });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  return "error";
}

serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const vt = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && token === vt && challenge)
      return new Response(challenge, { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "wa";
  if (!checkRL(ip))
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429,
      headers: { "Content-Type": "application/json" } });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const rawBody = await req.text();

    const sigCheck = await verifyMetaSignature(
      rawBody, req.headers.get("x-hub-signature-256"), "WHATSAPP_APP_SECRET",
    );
    if (!sigCheck.ok) {
      const sc = sigCheck.reason === "secret_not_configured" ? 503 : 403;
      return new Response(JSON.stringify({ error: sigCheck.reason }), {
        status: sc, headers: { "Content-Type": "application/json" },
      });
    }

    const body    = JSON.parse(rawBody);
    const entries = body?.entry ?? [];
    let processed = 0;
    let quarantined = 0;

    // Load all enabled WhatsApp channels once
    const { data: channels } = await sb.from("channels")
      .select("id,workspace_id,settings")
      .eq("channel_type", "whatsapp")
      .eq("is_enabled", true);

    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const change of changes) {
        const msgs     = change.value?.messages  ?? [];
        const contacts = change.value?.contacts  ?? [];
        const statuses = change.value?.statuses  ?? [];
        const wabaPhone = change.value?.metadata?.phone_number_id as string | undefined;

        // REQUIRE exact phone_number_id match — NO fallback to first channel
        if (!wabaPhone) {
          console.warn("[WA] Missing phone_number_id in metadata — quarantining change");
          quarantined++;
          continue;
        }

        const ch = (channels ?? []).find((c) => {
          const s = (c.settings as any) ?? {};
          return s.phone_number_id === wabaPhone || s.waba_phone_number_id === wabaPhone;
        });

        if (!ch) {
          console.warn(`[WA] No channel for phone_number_id ${wabaPhone} — quarantining`);
          quarantined++;
          continue;
        }

        const workspaceId = ch.workspace_id;
        const channelId   = ch.id;

        // Delivery status updates (lightweight — no idempotency claim needed)
        for (const st of statuses) {
          await sb.from("inbox_messages")
            .update({ delivery_status: st.status, updated_at: new Date().toISOString() })
            .eq("provider_message_id", st.id).catch(() => {});
        }

        // Inbound messages
        for (const msg of msgs) {
          const waId = msg?.id ?? `wa:${Date.now()}`;

          // ATOMIC idempotency claim BEFORE any side effect
          const claim = await claimEvent(sb, "whatsapp", waId, workspaceId);
          if (claim === "duplicate") continue;
          if (claim === "error") { quarantined++; continue; }

          const contact    = contacts.find((c: any) => c.wa_id === msg.from);
          const senderName = contact?.profile?.name ?? msg.from;
          const msgContent = msg.text?.body ?? msg.caption ?? `[${msg.type ?? "media"}]`;

          // Inbox
          await sb.from("inbox_messages").insert({
            workspace_id:       workspaceId,
            channel_id:         channelId,
            channel_type:       "whatsapp",
            source_name:        "WhatsApp",
            sender_name:        senderName,
            sender_identifier:  msg.from,
            message_content:    msgContent,
            message_timestamp:  new Date((Number(msg.timestamp ?? 0)) * 1000).toISOString(),
            direction:          "inbound",
            status:             "received",
            delivery_status:    "delivered",
            provider_message_id: waId,
            is_unread:          true,
            metadata:           { waba_phone: wabaPhone, wa_id: msg.from, type: msg.type },
          }).catch(() => {});

          // Lead upsert
          const { data: lead } = await sb.from("leads").upsert({
            workspace_id:       workspaceId,
            channel_type:       "whatsapp",
            contact_identifier: msg.from,
            source_type:        "whatsapp",
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
                action:       "feedback",
                workspace_id: workspaceId,
                lead_id:      lead.id,
                event_type:   "replied",
                channel:      "whatsapp",
                event_data:   { wa_id: msg.from, msg_id: waId, waba_phone: wabaPhone },
              }),
            }).catch(() => {});
          }

          // Opt-out handling
          if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
            const btn = msg.interactive.button_reply;
            if (btn?.id?.startsWith("OPT_OUT")) {
              await sb.from("contact_consent").upsert({
                workspace_id: workspaceId,
                lead_id:      lead?.id ?? null,
                channel:      "whatsapp",
                consented:    false,
                opt_out_date: new Date().toISOString(),
                opt_out_reason: "user_opt_out",
              }, { onConflict: "workspace_id,lead_id,channel" }).catch(() => {});
            }
          }

          processed++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, quarantined }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[WA-WEBHOOK] error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
