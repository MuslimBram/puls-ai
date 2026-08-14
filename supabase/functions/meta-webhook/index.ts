import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { verifyMetaSignature } from "../_shared/webhook-signatures.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

// Rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 200;
const RATE_WINDOW = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/**
 * Meta Webhook — Unified handler for Instagram Graph API & Facebook Messenger
 * 
 * Routes:
 *   GET  — Webhook verification (hub.verify_token challenge)
 *   POST — Incoming messages from Instagram DMs & Facebook Messenger
 * 
 * Both platforms use the same Meta webhook format with object="instagram" or object="page".
 * Requires META_VERIFY_TOKEN secret.
 */

async function notifyBrain(sb: ReturnType<typeof createClient>, opts: {
  workspace_id: string; lead_id?: string; event_type: string;
  channel?: string; broadcast_id?: string; event_data?: Record<string,unknown>;
}): Promise<void> {
  if (!opts.lead_id) return;  // can't notify without a lead
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
      },
      body: JSON.stringify({
        action: "feedback",
        workspace_id: opts.workspace_id,
        lead_id: opts.lead_id,
        event_type: opts.event_type,
        channel: opts.channel,
        broadcast_id: opts.broadcast_id,
        event_data: opts.event_data ?? {},
      }),
    });
  } catch { /* non-critical — webhook must not fail if brain is down */ }
}

serve(async (req) => {
  // --- Webhook Verification (GET) ---
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
    if (mode === "subscribe" && token === verifyToken) {
      console.log("[META-WEBHOOK] Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "meta";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const rawBody = await req.text();
    const sigCheck = await verifyMetaSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      "META_APP_SECRET",
    );
    if (!sigCheck.ok) {
      console.warn("[META-WEBHOOK] Signature check failed:", sigCheck.reason);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }
    const body = JSON.parse(rawBody);
    const startTime = Date.now();
    const objectType = body?.object; // "instagram" or "page" (Facebook Messenger)
    const entries = body?.entry || [];
    let processed = 0;
    let errors = 0;

    for (const entry of entries) {
      const pageId = entry.id;

      // --- Instagram DM Messages ---
      if (objectType === "instagram") {
        const messaging = entry?.messaging || [];
        for (const event of messaging) {
          try {
            if (!event.message) continue; // skip delivery/read receipts

            const senderId = event.sender?.id;
            const messageText = event.message?.text || "";
            const attachments = event.message?.attachments || [];

            let content = messageText;
            if (!content && attachments.length > 0) {
              content = attachments.map((a: any) => `[${a.type}]`).join(" ");
            }
            if (!content) continue;

            const channelType = "instagram";
            const result = await processMessage(supabase, {
              pageId,
              channelType,
              senderId,
              senderName: senderId, // Instagram doesn't provide name in webhook
              content,
              timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
            });

            if (result.success) processed++;
            else errors++;
          } catch (e) {
            console.error("[META-WEBHOOK] Instagram message error:", e);
            errors++;
          }
        }
      }

      // --- Facebook Messenger Messages ---
      if (objectType === "page") {
        const messaging = entry?.messaging || [];
        for (const event of messaging) {
          try {
            if (!event.message) continue;

            const senderId = event.sender?.id;
            const messageText = event.message?.text || "";
            const attachments = event.message?.attachments || [];

            let content = messageText;
            if (!content && attachments.length > 0) {
              content = attachments.map((a: any) => `[${a.type}: ${a.payload?.url || ""}]`).join(" ");
            }
            if (!content) continue;

            const result = await processMessage(supabase, {
              pageId,
              channelType: "facebook",
              senderId,
              senderName: senderId,
              content,
              timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
            });

            if (result.success) processed++;
            else errors++;
          } catch (e) {
            console.error("[META-WEBHOOK] Facebook message error:", e);
            errors++;
          }
        }
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`[META-WEBHOOK] ${objectType} — Processed: ${processed}, Errors: ${errors}, Time: ${processingTime}ms`);

    // Log activity
    await supabase.from("webhook_activity_logs").insert({
      event_type: "incoming_message",
      source: objectType === "instagram" ? "instagram" : "facebook",
      method: "POST",
      endpoint: "/meta-webhook",
      payload_preview: JSON.stringify(body).slice(0, 500),
      status: errors > 0 ? "failed" : "processed",
      processing_time_ms: processingTime,
      ip_address: clientIp,
      metadata: { object_type: objectType, entries: entries.length, processed, errors },
    }).then(() => {}).catch((e: any) => console.error("[META-WEBHOOK] Log insert error:", e));

    return new Response(
      JSON.stringify({ ok: true, object: objectType, processed, errors }),
      { status: 200, headers: { ...getCors(req), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[META-WEBHOOK] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } },
    );
  }
});

// --- Shared message processing ---
interface IncomingMessage {
  pageId: string;
  channelType: "instagram" | "facebook";
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}

async function processMessage(
  supabase: any,
  msg: IncomingMessage,
): Promise<{ success: boolean }> {
  // Find channel by page_id in settings
  const { data: channels } = await supabase
    .from("channels")
    .select("id, user_id, settings")
    .eq("channel_type", msg.channelType)
    .eq("is_enabled", true)
    .limit(100);

  const matchedChannel = (channels || []).find((ch: any) => {
    const s = ch.settings as Record<string, any> | null;
    return s?.page_id === msg.pageId || s?.instagram_account_id === msg.pageId;
  });

  if (!matchedChannel) {
    console.warn(`[META-WEBHOOK] No ${msg.channelType} channel for page: ${msg.pageId}`);
    return { success: false };
  }

  // Keyword matching
  const { data: keywords } = await supabase
    .from("keywords")
    .select("keyword")
    .eq("user_id", matchedChannel.user_id)
    .eq("is_active", true);

  const textLower = msg.content.toLowerCase();
  const matched = (keywords || [])
    .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
    .map((k: any) => k.keyword);

  const intentScore = matched.length > 0 ? 0.5 : 0.1;

  // Insert inbox message
  // Upsert conversation thread for traceability
  const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
    _user_id: matchedChannel.user_id,
    _channel_type: msg.channelType,
    _contact_identifier: msg.senderId,
    _contact_name: msg.senderName,
    _message_preview: msg.content,
    _direction: "inbound",
  });

  const { data: inboxMsg, error: inboxErr } = await supabase.from("inbox_messages").insert({
    user_id: matchedChannel.user_id,
    channel_id: matchedChannel.id,
    channel_type: msg.channelType,
    source_name: msg.channelType === "instagram" ? "Instagram" : "Facebook Messenger",
    sender_name: msg.senderName,
    sender_identifier: msg.senderId,
    message_content: msg.content,
    message_timestamp: msg.timestamp,
    intent_score: intentScore,
    matched_keywords: matched,
    is_unread: true,
    priority: matched.length > 0 ? "medium" : "normal",
    status: "new",
    thread_id: threadId || null,
  }).select("id").single();

  if (inboxErr) {
    console.error(`[META-WEBHOOK] Inbox insert error:`, inboxErr);
    return { success: false };
  }

  // Create lead if keywords matched
  if (matched.length > 0 && intentScore >= 0.3) {
    await supabase.from("leads").insert({
      user_id: matchedChannel.user_id,
      message_content: msg.content,
      source_name: msg.senderName,
      source_type: msg.channelType,
      channel_type: msg.channelType,
      contact_identifier: msg.senderId,
      thread_id: threadId || null,
      inbox_message_id: inboxMsg?.id || null,
      message_date: msg.timestamp,
      detected_keyword: matched[0],
      intent_score: intentScore,
      status: "new",
    });
  }

  return { success: true };
}
