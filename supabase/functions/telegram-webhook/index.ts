/**
 * telegram-webhook — Security-hardened Telegram update handler
 *
 * IMPORTANT: This function is NOT the active ingestion path for this release.
 * Active path: telegram-poll (cron) — do NOT register this webhook URL with Telegram.
 * Future migration: smoke-test this function, then disable telegram-poll cron,
 * then register with: POST https://api.telegram.org/bot{TOKEN}/setWebhook?url={URL}&secret_token={SECRET}
 *
 * SECURITY:
 *   - TELEGRAM_WEBHOOK_SECRET must be set — fail closed if missing (503)
 *   - X-Telegram-Bot-Api-Secret-Token must match — reject (401) if invalid
 *   - update_id idempotency BEFORE any side effects
 *   - workspace resolved from channel config — no global keyword routing
 *   - AI through Pulse ai-router only — no direct Anthropic/Lovable calls
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { verifyTelegramSecret } from "../_shared/webhook-signatures.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 }); return true;
  }
  if (entry.count >= 300) return false;
  entry.count++;
  return true;
}

async function callAIRouter(messages: Array<{role:string;content:string}>, system: string): Promise<string> {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-router`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ task_type: "lead_analysis", messages, system_prompt: system, max_tokens: 300 }),
    });
    if (!res.ok) return "";
    const d = await res.json() as any;
    return d.response ?? d.content ?? d.text ?? "";
  } catch { return ""; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "tg";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  // FAIL-CLOSED: TELEGRAM_WEBHOOK_SECRET must be configured
  const secretCheck = verifyTelegramSecret(req.headers.get("x-telegram-bot-api-secret-token"));
  if (!secretCheck.ok) {
    const statusCode = secretCheck.reason === "secret_not_configured" ? 503 : 401;
    console.warn(`[TG-WEBHOOK] Auth rejected (${statusCode}): ${secretCheck.reason}`);
    return new Response(JSON.stringify({ error: secretCheck.reason }), {
      status: statusCode, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const update = await req.json();
    const update_id = update?.update_id;

    if (!update_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_update_id" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // IDEMPOTENCY: BEFORE any side effects
    const iKey = `telegram:${update_id}`;
    const { data: dup } = await supabase.from("processed_webhook_events")
      .select("id").eq("provider", "telegram").eq("event_id", iKey).maybeSingle();
    if (dup) {
      return new Response(JSON.stringify({ ok: true, status: "already_processed" }), {
        status: 200, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }
    await supabase.from("processed_webhook_events")
      .insert({ provider: "telegram", event_id: iKey }).catch(() => {});

    const msg = update.message ?? update.channel_post;
    if (!msg?.text) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_message_text" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const chatId = msg.chat?.id;
    const senderId = String(msg.from?.id ?? chatId ?? "unknown");
    const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || senderId;
    const msgDate = new Date((msg.date ?? 0) * 1000).toISOString();

    // Workspace resolution: look up channel by chat_id or bot (stored in channel settings)
    // The telegram-poll function uses bot_token to match channels — webhook uses chat matching
    const { data: channels } = await supabase.from("channels")
      .select("id,workspace_id,user_id,settings")
      .eq("channel_type", "telegram")
      .eq("is_enabled", true);

    let workspaceId: string | null = null;
    let channelId: string | null = null;

    for (const ch of (channels ?? [])) {
      const s = (ch.settings as any) ?? {};
      // Match by allowed_chat_ids or default to first enabled telegram channel
      const allowedChats: string[] = s.allowed_chat_ids ?? [];
      if (allowedChats.length === 0 || allowedChats.includes(String(chatId))) {
        workspaceId = ch.workspace_id;
        channelId = ch.id;
        break;
      }
    }

    if (!workspaceId) {
      console.warn("[TG-WEBHOOK] No workspace resolved for chat", chatId);
      return new Response(JSON.stringify({ ok: true, skipped: "no_workspace" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // Inbox message — store the message
    const { data: inboxMsg } = await supabase.from("inbox_messages").insert({
      workspace_id: workspaceId,
      channel_id: channelId,
      channel_type: "telegram",
      source_name: msg.chat?.title ?? msg.chat?.username ?? "Telegram",
      sender_name: senderName,
      sender_identifier: senderId,
      message_content: msg.text,
      message_timestamp: msgDate,
      direction: "inbound",
      status: "received",
      delivery_status: "delivered",
      is_unread: true,
      priority: "normal",
      provider_message_id: String(update_id),
      metadata: { chat_id: chatId, chat_type: msg.chat?.type, update_id },
    }).select("id").single();

    // AI analysis via Pulse ai-router (NOT direct Anthropic/Lovable)
    let intentScore = 0.3;
    let suggestedReply = "";

    const aiRaw = await callAIRouter(
      [{ role: "user", content: msg.text }],
      `Analyze buying intent for this Telegram message. Reply JSON only:
{"intent_score": 0-1, "is_lead": boolean, "suggested_reply": string}
Keep suggested_reply under 200 chars. Language: detect from message.`
    );

    try {
      const parsed = JSON.parse(aiRaw.replace(/\`\`\`json|\`\`\`/g, "").trim()) as any;
      intentScore = parsed.intent_score ?? 0.3;
      suggestedReply = parsed.suggested_reply ?? "";
    } catch { /* use defaults */ }

    // Create lead only when intent threshold met
    let leadId: string | null = null;
    if (intentScore >= 0.3) {
      const { data: lead } = await supabase.from("leads").insert({
        workspace_id: workspaceId,
        channel_type: "telegram",
        contact_identifier: senderId,
        message_content: msg.text,
        source_name: msg.chat?.title ?? "Telegram",
        source_type: "telegram",
        message_date: msgDate,
        intent_score: intentScore,
        suggested_reply: suggestedReply,
        status: "new",
      }).select("id").single();
      leadId = lead?.id ?? null;
    }

    // Customer Brain: message activity (not financial — messaging only)
    if (leadId && workspaceId) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
        },
        body: JSON.stringify({
          action: "feedback",
          workspace_id: workspaceId,
          lead_id: leadId,
          event_type: "replied",
          channel: "telegram",
          event_data: { update_id, chat_id: chatId },
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({
      ok: true,
      update_id,
      workspace_id: workspaceId,
      lead_id: leadId,
      inbox_id: inboxMsg?.id,
      intent_score: intentScore,
    }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[TG-WEBHOOK] error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
