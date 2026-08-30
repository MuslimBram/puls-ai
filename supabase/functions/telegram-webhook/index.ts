import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import {
  blocksNormalIngress,
  extractSecurityUrls,
  scanInboundContent,
} from "../_shared/content-security-client.ts";
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
  if (channel.workspace_id) return { workspaceId: channel.workspace_id };

  const [ownedResult, memberResult] = await Promise.all([
    supabase.from("workspaces").select("id").eq("owner_id", channel.user_id),
    supabase.from("workspace_members").select("workspace_id").eq("user_id", channel.user_id),
  ]);
  if (ownedResult.error) throw ownedResult.error;
  if (memberResult.error) throw memberResult.error;

  const candidates = new Set<string>();
  for (const row of ownedResult.data || []) candidates.add(row.id);
  for (const row of memberResult.data || []) if (row.workspace_id) candidates.add(row.workspace_id);
  if (candidates.size !== 1) return { workspaceId: null, blocker: "TELEGRAM_WORKSPACE_MAPPING_BLOCKER" };

  const workspaceId = [...candidates][0];
  const { error: updateError } = await supabase
    .from("channels")
    .update({ workspace_id: workspaceId })
    .eq("id", channel.id)
    .is("workspace_id", null);
  if (updateError) throw updateError;
  return { workspaceId };
}

function telegramAttachment(msg: Record<string, any>): { mime_type: string } | null {
  if (Array.isArray(msg.photo) && msg.photo.length) return { mime_type: "image/jpeg" };
  if (msg.document) return { mime_type: String(msg.document.mime_type || "application/octet-stream") };
  if (msg.video) return { mime_type: String(msg.video.mime_type || "video/mp4") };
  if (msg.animation) return { mime_type: String(msg.animation.mime_type || "video/mp4") };
  if (msg.audio) return { mime_type: String(msg.audio.mime_type || "audio/mpeg") };
  if (msg.voice) return { mime_type: String(msg.voice.mime_type || "audio/ogg") };
  if (msg.sticker) return { mime_type: "image/webp" };
  return null;
}

function telegramContent(msg: Record<string, any>, attachment: { mime_type: string } | null): string {
  if (typeof msg.text === "string" && msg.text.trim()) return msg.text;
  if (typeof msg.caption === "string" && msg.caption.trim()) return msg.caption;
  return attachment ? `[telegram_attachment:${attachment.mime_type}]` : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST required" }), {
      status: 405,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey()!);
  let claimedWorkspaceId: string | null = null;
  let claimedIdempotencyKey: string | null = null;

  try {
    const payload = await req.json();
    const msg = payload?.message || payload?.edited_message;
    if (!msg) {
      return new Response(JSON.stringify({ ok: true, skipped: "No message content" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const updateId = payload?.update_id;
    if (!Number.isInteger(updateId) || updateId < 0) {
      // Telegram update_id is the provider-native stable retry identity. Without
      // it we cannot safely dedupe or bind the content-security decision.
      return new Response(JSON.stringify({ ok: true, quarantined: true, reason: "missing_update_id" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const messageId = msg?.message_id;
    if (!Number.isInteger(messageId) || messageId < 0 || !msg?.chat?.id || !msg?.from?.id) {
      return new Response(JSON.stringify({ ok: true, quarantined: true, reason: "invalid_message_identity" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const attachment = telegramAttachment(msg);
    const content = telegramContent(msg, attachment);
    if (!content) {
      return new Response(JSON.stringify({ ok: true, skipped: "Unsupported Telegram event" }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

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
    if (!channel.user_id) {
      return new Response(JSON.stringify({ ok: false, error: "Channel configuration error" }), {
        status: 409,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const { workspaceId, blocker } = await resolveWorkspaceFromChannel(supabase, channel);
    if (!workspaceId) {
      return new Response(JSON.stringify({ ok: false, error: blocker || "Workspace mapping unavailable" }), {
        status: 409,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const chatId = String(msg.chat.id);
    const senderId = String(msg.from.id);
    const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ")
      || msg.from.username || "Telegram User";
    const idempotencyKey = `tg:${channel.id}:update:${String(updateId)}`;

    // Provider authentication + canonical tenant + stable update_id are resolved
    // before the universal security boundary. Media is never skipped: until the
    // real malware worker is integrated, attachment metadata forces quarantine.
    const security = await scanInboundContent({
      workspace_id: workspaceId,
      source: "telegram",
      event_id: idempotencyKey,
      content,
      urls: extractSecurityUrls(content),
      attachment,
    });

    if (!security.ok) {
      console.error(`[TELEGRAM-WEBHOOK] Content-security unavailable: ${security.code}`);
      return new Response(JSON.stringify({ ok: false, error: "content_security_unavailable" }), {
        status: 500,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (blocksNormalIngress(security.decision)) {
      return new Response(JSON.stringify({ ok: true, quarantined: true, event_id: idempotencyKey }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const { data: integrationRow, error: integrationError } = await supabase
      .from("external_integrations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("integration_key", "telegram")
      .maybeSingle();
    if (integrationError) throw integrationError;

    const { error: claimErr } = await supabase.from("integration_event_logs").insert({
      integration_id: integrationRow?.id,
      user_id: channel.user_id,
      workspace_id: workspaceId,
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
        message_id: String(messageId),
        update_id: String(updateId),
        content_security: {
          event_id: idempotencyKey,
          category: security.decision.category,
          risk_score: security.decision.risk_score,
          action: security.decision.action,
        },
      },
      payload,
    });

    if (claimErr) {
      let reclaimedForRetry = false;
      if (claimErr.code === "23505" || String(claimErr.message || "").toLowerCase().includes("unique")) {
        const { data: existingClaim } = await supabase
          .from("integration_event_logs")
          .select("id, status")
          .eq("workspace_id", workspaceId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (existingClaim?.status === "failed") {
          const { data: reclaimed } = await supabase
            .from("integration_event_logs")
            .update({ status: "processing" })
            .eq("id", existingClaim.id)
            .eq("workspace_id", workspaceId)
            .eq("status", "failed")
            .select("id")
            .maybeSingle();
          if (!reclaimed) {
            return new Response(JSON.stringify({ ok: true, duplicate: true }), {
              headers: { ...getCors(req), "Content-Type": "application/json" },
            });
          }
          reclaimedForRetry = true;
        } else {
          return new Response(JSON.stringify({ ok: true, duplicate: true }), {
            headers: { ...getCors(req), "Content-Type": "application/json" },
          });
        }
      }
      if (!reclaimedForRetry) {
        return new Response(JSON.stringify({ ok: false, error: "idempotency_claim_failed" }), {
          status: 500,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
    }

    claimedWorkspaceId = workspaceId;
    claimedIdempotencyKey = idempotencyKey;

    let intentScore = 0.3;
    let suggestedReply = "";
    const aiRaw = await callAIRouter(
      [{ role: "user", content }],
      `Analyze buying intent for this Telegram message. Reply JSON only:
{"intent_score": 0-1, "is_lead": boolean, "suggested_reply": string}
Keep suggested_reply under 200 chars. Language: detect from message.`,
      { taskType: "text_classification", workspaceId },
    );

    try {
      const parsed = JSON.parse(aiRaw.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
      const parsedScore = Number(parsed.intent_score ?? 0.3);
      intentScore = Number.isFinite(parsedScore) ? Math.min(1, Math.max(0, parsedScore)) : 0.3;
      suggestedReply = String(parsed.suggested_reply ?? "").slice(0, 500);
    } catch {
      await supabase.from("integration_event_logs")
        .update({ status: "failed", event_message: "Telegram AI parse failure" })
        .eq("workspace_id", workspaceId)
        .eq("idempotency_key", idempotencyKey);
      return new Response(JSON.stringify({ ok: false, error: "invalid_ai_response" }), {
        status: 502,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    let leadId: string | null = null;
    if (intentScore >= 0.3) {
      const { data: existingLead, error: leadLookupError } = await supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("contact_identifier", `telegram:${senderId}`)
        .maybeSingle();
      if (leadLookupError) throw leadLookupError;

      if (existingLead) {
        leadId = existingLead.id;
      } else {
        const { data: newLead, error: newLeadError } = await supabase
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
        if (newLeadError) throw newLeadError;
        leadId = newLead?.id ?? null;
      }
    }

    const { data: threadId, error: threadError } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: channel.user_id,
      _workspace_id: workspaceId,
      _channel_type: "telegram",
      _contact_identifier: chatId,
      _contact_name: senderName,
      _message_preview: content,
      _direction: "inbound",
    });
    if (threadError || !threadId) throw new Error("Conversation thread persistence failed");

    const { data: existingInbox, error: inboxLookupError } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("channel_id", channel.id)
      .eq("provider_message_id", String(messageId))
      .limit(1)
      .maybeSingle();
    if (inboxLookupError) throw inboxLookupError;

    if (existingInbox && payload?.edited_message) {
      const { error: editError } = await supabase.from("inbox_messages")
        .update({
          message_content: content,
          intent_score: intentScore,
          updated_at: new Date().toISOString(),
          metadata: {
            chat_id: chatId,
            telegram_user_id: senderId,
            update_id: String(updateId),
            edited: true,
            content_security: {
              event_id: idempotencyKey,
              category: security.decision.category,
              risk_score: security.decision.risk_score,
              action: security.decision.action,
            },
          },
        })
        .eq("id", existingInbox.id)
        .eq("workspace_id", workspaceId);
      if (editError) throw editError;
    } else if (!existingInbox) {
      const { error: inboxError } = await supabase.from("inbox_messages").insert({
        user_id: channel.user_id,
        workspace_id: workspaceId,
        channel_id: channel.id,
        channel_type: "telegram",
        source_name: "Telegram",
        sender_name: senderName,
        sender_identifier: `telegram:${senderId}`,
        message_content: content,
        message_timestamp: new Date(Number(msg.date) * 1000).toISOString(),
        is_unread: true,
        status: "received",
        direction: "inbound",
        delivery_status: "delivered",
        provider_message_id: String(messageId),
        thread_id: threadId,
        metadata: {
          chat_id: chatId,
          telegram_user_id: senderId,
          update_id: String(updateId),
          content_security: {
            event_id: idempotencyKey,
            category: security.decision.category,
            risk_score: security.decision.risk_score,
            action: security.decision.action,
          },
        },
        intent_score: intentScore,
      } as never);
      if (inboxError) throw inboxError;
    }

    const { error: completionError } = await supabase.from("integration_event_logs")
      .update({
        status: "processed",
        metadata: {
          lead_id: leadId,
          workspace_id: workspaceId,
          channel_id: channel.id,
          message_id: String(messageId),
          update_id: String(updateId),
          content_security: {
            event_id: idempotencyKey,
            category: security.decision.category,
            risk_score: security.decision.risk_score,
            action: security.decision.action,
          },
        },
      })
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", idempotencyKey)
      .eq("status", "processing");
    if (completionError) throw completionError;

    return new Response(JSON.stringify({
      ok: true,
      processed: true,
      event_id: idempotencyKey,
      lead_id: leadId,
      suggested_reply: suggestedReply,
    }), { headers: { ...getCors(req), "Content-Type": "application/json" } });
  } catch (e) {
    if (claimedWorkspaceId && claimedIdempotencyKey) {
      const { error: failureUpdateError } = await supabase
        .from("integration_event_logs")
        .update({ status: "failed", event_message: "Telegram processing failure" })
        .eq("workspace_id", claimedWorkspaceId)
        .eq("idempotency_key", claimedIdempotencyKey)
        .eq("status", "processing");
      if (failureUpdateError) {
        console.error("[TELEGRAM-WEBHOOK] Failed to release processing claim:", failureUpdateError.code ?? "unknown");
      }
    }

    console.error("[TELEGRAM-WEBHOOK] Error:", e instanceof Error ? e.message : "Unknown");
    return new Response(JSON.stringify({ ok: false, error: "telegram_processing_failed" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
