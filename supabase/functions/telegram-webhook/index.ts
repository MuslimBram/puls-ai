import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  try {
    const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
    const configuredSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (configuredSecret && secretHeader !== configuredSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

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
    );

    const chatId = String(msg.chat.id);
    const senderId = String(msg.from.id);
    const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || msg.from.username || "Telegram User";

    const { data: channel } = await supabase
      .from("channels")
      .select("id, workspace_id")
      .eq("channel_type", "telegram")
      .eq("is_enabled", true)
      .limit(1)
      .single();

    if (!channel) {
      return new Response(JSON.stringify({ ok: true, warning: "No active Telegram channel" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const workspaceId = channel.workspace_id;

    let intentScore = 0.3;
    let suggestedReply = "";
    const aiRaw = await callAIRouter(
      [{ role: "user", content: msg.text }],
      `Analyze buying intent for this Telegram message. Reply JSON only:
{"intent_score": 0-1, "is_lead": boolean, "suggested_reply": string}
Keep suggested_reply under 200 chars. Language: detect from message.`,
      {
        taskType: "text_classification",
        workspaceId,
      }
    );

    try {
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
            name: senderName,
            contact_identifier: `telegram:${senderId}`,
            channel: "telegram",
            status: intentScore >= 0.7 ? "hot" : "new",
            score: intentScore,
            metadata: { telegram_chat_id: chatId, username: msg.from.username },
          })
          .select("id")
          .single();
        leadId = newLead?.id ?? null;
      }
    }

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

    await supabase.from("integration_event_logs").insert({
      workspace_id: workspaceId,
      adapter_key: "telegram",
      event_type: "message",
      idempotency_key: idempotencyKey,
      status: "processed",
      metadata: { chat_id: chatId, sender_id: senderId, text: msg.text, lead_id: leadId },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        processed: true,
        lead_id: leadId,
        suggested_reply: suggestedReply,
      }),
      { headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[TELEGRAM-WEBHOOK] Error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  }
});
