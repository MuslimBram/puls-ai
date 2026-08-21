/**
 * telegram-webhook — SOCIAL-0 hardened
 *
 * Workspace resolution priority (highest → lowest):
 *   1. ?channel_id=<uuid> URL parameter  — deterministic (new registrations)
 *   2. x-telegram-bot-api-secret-token header matched against
 *      channels.settings.telegram_webhook_secret  — per-channel secret (upgrade path)
 *   3. Exactly-one-channel safe fallback — only when exactly ONE enabled Telegram
 *      channel exists in the entire installation (single-workspace deployments)
 *
 * Fail-closed rules (SOCIAL-0 invariant):
 *   - 0 matching channels  → 200 skip, zero side effects
 *   - >1 channels and no discriminator → QUARANTINE, zero side effects,
 *     log TELEGRAM_DETERMINISTIC_MAPPING_BLOCKER
 *   - First-match-wins is REMOVED.
 *   - All lead/inbox/AI work happens ONLY after workspace is resolved.
 *
 * TELEGRAM_DETERMINISTIC_MAPPING_BLOCKER:
 *   When multiple workspaces have Telegram channels registered against the same
 *   webhook URL and no per-channel discriminator is available, deterministic
 *   workspace routing is impossible without one of:
 *     (a) ?channel_id=<uuid> in the webhook URL registered with Telegram setWebhook,
 *     (b) channels.settings.telegram_webhook_secret set per-channel and used as
 *         the secret_token parameter in the Telegram setWebhook call.
 *   Until existing channels are re-registered with one of these discriminators,
 *   Telegram ingest is disabled for multi-channel installations.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

// UUID v4 pattern used to validate channel_id URL parameter.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve exactly one Telegram channel/workspace.
 * Returns { channelId, workspaceId } on success, or a resolution failure object.
 */
async function resolveTelegramWorkspace(
  sb: ReturnType<typeof createClient>,
  secretHeader: string | null,
  channelIdParam: string | null,
): Promise<
  | { ok: true; channelId: string; workspaceId: string }
  | { ok: false; reason: "zero_channels" | "ambiguous" | "not_found" | "blocker" }
> {
  if (channelIdParam) {
    if (!UUID_RE.test(channelIdParam)) {
      return { ok: false, reason: "not_found" };
    }
    const { data: ch } = await sb
      .from("channels")
      .select("id, workspace_id")
      .eq("id", channelIdParam)
      .eq("channel_type", "telegram")
      .eq("is_enabled", true)
      .maybeSingle();

    if (!ch) return { ok: false, reason: "not_found" };
    return { ok: true, channelId: ch.id, workspaceId: ch.workspace_id };
  }

  if (secretHeader) {
    const { data: channels } = await sb
      .from("channels")
      .select("id, workspace_id, settings")
      .eq("channel_type", "telegram")
      .eq("is_enabled", true);

    const matches = (channels ?? []).filter((ch) => {
      const s = (ch.settings as Record<string, unknown>) ?? {};
      return s.telegram_webhook_secret === secretHeader;
    });

    if (matches.length === 0) return { ok: false, reason: "not_found" };
    if (matches.length > 1) {
      console.error("[TG] AMBIGUOUS: multiple channels share the same telegram_webhook_secret");
      return { ok: false, reason: "ambiguous" };
    }
    return { ok: true, channelId: matches[0].id, workspaceId: matches[0].workspace_id };
  }

  const { data: allChannels } = await sb
    .from("channels")
    .select("id, workspace_id")
    .eq("channel_type", "telegram")
    .eq("is_enabled", true);

  const count = allChannels?.length ?? 0;

  if (count === 0) return { ok: false, reason: "zero_channels" };

  if (count === 1) {
    const ch = allChannels![0];
    return { ok: true, channelId: ch.id, workspaceId: ch.workspace_id };
  }

  // count > 1 with no discriminator — FAIL CLOSED
  console.error(
    "[TG] TELEGRAM_DETERMINISTIC_MAPPING_BLOCKER: " +
    `${count} enabled Telegram channels exist but no channel_id param or ` +
    "per-channel telegram_webhook_secret is present. " +
    "Re-register each bot webhook with ?channel_id=<uuid> or set " +
    "channels.settings.telegram_webhook_secret per channel."
  );
  return { ok: false, reason: "blocker" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  try {
    const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");

    const globalSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (globalSecret && secretHeader !== globalSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(req.url);
    const channelIdParam = url.searchParams.get("channel_id");

    const payload = await req.json();
    const msg = payload?.message || payload?.edited_message;
    if (!msg || !msg.text) {
      return new Response(JSON.stringify({ ok: true, skipped: "No text content" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()!,
      { auth: { persistSession: false } },
    );

    // Deterministic workspace resolution — BEFORE any side effects
    const resolution = await resolveTelegramWorkspace(
      supabase,
      secretHeader,
      channelIdParam,
    );

    if (!resolution.ok) {
      if (resolution.reason === "zero_channels") {
        return new Response(JSON.stringify({ ok: true, skipped: "No active Telegram channel" }), {
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      const detail =
        resolution.reason === "blocker"
          ? "TELEGRAM_DETERMINISTIC_MAPPING_BLOCKER: multiple channels; re-register webhooks with ?channel_id=<uuid>"
          : resolution.reason === "ambiguous"
          ? "AMBIGUOUS_CHANNEL: multiple channels matched the webhook secret"
          : "CHANNEL_NOT_FOUND: no enabled Telegram channel matched the request";
      console.warn(`[TG] quarantine — ${detail}`);
      return new Response(JSON.stringify({ ok: true, quarantined: true, reason: detail }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // Workspace resolved — begin side-effect work
    const { channelId, workspaceId } = resolution;

    const chatId = String(msg.chat.id);
    const senderId = String(msg.from.id);
    const senderName =
      [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") ||
      msg.from.username ||
      "Telegram User";

    // Idempotency check BEFORE lead creation or AI call.
    const idempotencyKey = `tg:${msg.message_id}`;
    const { data: existingLog } = await supabase
      .from("integration_event_logs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingLog) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    let intentScore = 0.3;
    let suggestedReply = "";
    try {
      const aiRaw = await callAIRouter(
        [{ role: "user", content: msg.text }],
        `Analyze buying intent for this Telegram message. Reply JSON only:\n{"intent_score": 0-1, "is_lead": boolean, "suggested_reply": string}\nKeep suggested_reply under 200 chars. Language: detect from message.`,
        { taskType: "text_classification", workspaceId },
      );
      const parsed = JSON.parse(aiRaw.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
      intentScore = Number(parsed.intent_score ?? 0.3);
      suggestedReply = String(parsed.suggested_reply ?? "");
    } catch { /* use defaults */ }

    let leadId: string | null = null;
    if (intentScore >= 0.3) {
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("contact_identifier", `telegram:${senderId}`)
        .maybeSingle();

      if (existingLead) {
        leadId = existingLead.id;
      } else {
        const { data: newLead } = await supabase
          .from("leads")
          .insert({
            workspace_id: workspaceId,
            source_name: senderName,
            contact_identifier: `telegram:${senderId}`,
            channel_type: "telegram",
            source_type: "telegram",
            status: intentScore >= 0.7 ? "hot" : "new",
            intent_score: intentScore,
            message_content: msg.text.slice(0, 2000),
            message_date: new Date().toISOString(),
          })
          .select("id")
          .single();
        leadId = newLead?.id ?? null;
      }
    }

    await supabase.from("integration_event_logs").insert({
      workspace_id: workspaceId,
      adapter_key: "telegram",
      event_type: "message",
      idempotency_key: idempotencyKey,
      status: "processed",
      metadata: { channel_id: channelId, chat_id: chatId, sender_id: senderId, text: msg.text.slice(0, 500), lead_id: leadId },
    });

    return new Response(
      JSON.stringify({ ok: true, processed: true, lead_id: leadId, suggested_reply: suggestedReply }),
      { headers: { ...getCors(req), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[TELEGRAM-WEBHOOK] Error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } },
    );
  }
});
