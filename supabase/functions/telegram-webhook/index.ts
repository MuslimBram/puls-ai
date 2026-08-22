import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import {
  resolveAuthenticatedTelegramChannel,
  type TelegramChannelCandidate,
} from "../_shared/telegram-workspace-resolver.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

async function resolveWorkspaceFromChannel(
  supabase: ReturnType<typeof createClient>,
  channel: TelegramChannelCandidate,
): Promise<{ workspaceId: string | null; blocker?: string }> {
  if (channel.workspace_id) {
    return { workspaceId: channel.workspace_id };
  }

  const [ownedResult, memberResult] = await Promise.all([
    supabase.from("workspaces").select("id").eq("owner_id", channel.user_id),
    supabase.from("workspace_members").select("workspace_id").eq("user_id", channel.user_id),
  ]);

  if (ownedResult.error) throw ownedResult.error;
  if (memberResult.error) throw memberResult.error;

  const candidates = new Set<string>();
  for (const row of ownedResult.data || []) candidates.add(row.id);
  for (const row of memberResult.data || []) if (row.workspace_id) candidates.add(row.workspace_id);

  if (candidates.size !== 1) {
    return { workspaceId: null, blocker: "TELEGRAM_WORKSPACE_MAPPING_BLOCKER" };
  }

  const workspaceId = [...candidates][0];
  await supabase.from("channels").update({ workspace_id: workspaceId }).eq("id", channel.id);
  return { workspaceId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  try {
    const payload = await req.json();
    const msg = payload?.message || payload?.edited_message;
    if (!msg || !msg.text) {
      return new Response(JSON.stringify({ ok: true, skipped: "No text content" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey()!);

    const { data: channels, error: channelsError } = await supabase
      .from("channels")
      .select("id, workspace_id, user_id, settings")
      .eq("channel_type", "telegram")
      .eq("is_enabled", true);

    if (channelsError) throw channelsError;

    const requestedChannelId = new URL(req.url).searchParams.get("channel_id") || payload?.channel_id || null;
    const authResult = resolveAuthenticatedTelegramChannel({
      channels: (channels || []) as TelegramChannelCandidate[],
      secretHeader: req.headers.get("x-telegram-bot-api-secret-token"),
      configuredGlobalSecret: Deno.env.get("TELEGRAM_WEBHOOK_SECRET"),
      requestedChannelId: requestedChannelId ? String(requestedChannelId) : null,
    });

    if (!authResult.ok) {
      const status = authResult.reason === "secret_not_configured" ? 503 : 401;
      return new Response(JSON.stringify({ ok: false, error: authResult.reason }), {
        status,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const channel = authResult.channel;
    const { workspaceId, blocker } = await resolveWorkspaceFromChannel(supabase, channel);
    if (!workspaceId) {
      return new Response(JSON.stringify({ ok: false, error: blocker || "Workspace mapping unavailable" }), {
        status: 409,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const chatId = String(msg.chat.id);
    const senderId = String(msg.from.id);
    const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || msg.from.username || "Telegram User";

    const idempotencyKey = `tg:${channel.id}:${chatId}:${senderId}:${String(msg.message_id)}`;

    const { data: integrationRow } = await supabase
      .from("external_integrations")
      .select("id")
      .eq("user_id", channel.user_id)
      .eq("integration_key", "telegram")
      .limit(1)
      .maybeSingle();

    const { error: claimErr } = await supabase.from("integration_event_logs").insert({
      integration_id: integrationRow?.id,
      user_id: channel.user_id,
      event_type: "message",
      event_message: "Telegram inbound message",
      adapter_key: "telegram",
      idempotency_key: idempotencyKey,
      status: "processing",
      metadata: {
        channel_id: channel.id,
        workspace_id: workspaceId,
        chat_id: chatId,
        sender_id: senderId,
        message_id: String(msg.message_id),
      },
      payload,
    });

    if (claimErr) {
      if (claimErr.code === "23505" || String(claimErr.message || "").toLowerCase().includes("unique")) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: "idempotency_claim_failed" }), {
        status: 500,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

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
      },
    );

    try {
      const parsed = JSON.parse(aiRaw.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
      intentScore = Number(parsed.intent_score ?? 0.3);
      suggestedReply = String(parsed.suggested_reply ?? "");
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_ai_response" }), {
        status: 502,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

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
            user_id: channel.user_id,
            workspace_id: workspaceId,
            name: senderName,
            contact_identifier: `telegram:${senderId}`,
            channel: "telegram",
            status: intentScore >= 0.7 ? "hot" : "new",
            score: intentScore,
            metadata: { telegram_chat_id: chatId, username: msg.from.username, channel_id: channel.id },
          })
          .select("id")
          .single();
        leadId = newLead?.id ?? null;
      }
    }

    await supabase.from("inbox_messages").insert({
      user_id: channel.user_id,
      workspace_id: workspaceId,
      channel_id: channel.id,
      channel_type: "telegram",
      source_name: "Telegram",
      sender_name: senderName,
      sender_identifier: `telegram:${senderId}`,
      message_content: msg.text,
      message_timestamp: new Date((msg.date ? Number(msg.date) : Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      is_unread: true,
      status: "received",
      direction: "inbound",
      delivery_status: "delivered",
      provider_message_id: String(msg.message_id),
      metadata: { chat_id: chatId, telegram_user_id: senderId },
      intent_score: intentScore,
    } as never);

    await supabase
      .from("integration_event_logs")
      .update({ status: "processed", metadata: { lead_id: leadId, workspace_id: workspaceId, channel_id: channel.id } })
      .eq("idempotency_key", idempotencyKey);

    return new Response(
      JSON.stringify({
        ok: true,
        processed: true,
        lead_id: leadId,
        suggested_reply: suggestedReply,
      }),
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
