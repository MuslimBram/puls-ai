import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 150;
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
 * SMS Webhook — Twilio inbound + status callbacks
 * 
 * Handles:
 * - Inbound SMS (From, To, Body, Media)
 * - Status callbacks (MessageSid, MessageStatus, ErrorCode)
 * - Conversation threading
 * - Media attachment extraction
 * - Delivery state tracking
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sms";
  if (!checkRateLimit(clientIp)) {
    return new Response("<Response></Response>", { status: 429, headers: { "Content-Type": "text/xml" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const contentType = req.headers.get("content-type") || "";
    let from = "", to = "", body = "", messageSid = "", numMedia = 0;
    let messageStatus = "", errorCode = "", errorMessage = "";
    const mediaItems: Array<{ url: string; contentType: string; index: number }> = [];

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.text();
      const params = new URLSearchParams(formData);
      from = params.get("From") || "";
      to = params.get("To") || "";
      body = params.get("Body") || "";
      messageSid = params.get("MessageSid") || params.get("SmsSid") || "";
      numMedia = parseInt(params.get("NumMedia") || "0", 10);
      messageStatus = params.get("MessageStatus") || "";
      errorCode = params.get("ErrorCode") || "";
      errorMessage = params.get("ErrorMessage") || "";

      for (let i = 0; i < numMedia; i++) {
        const url = params.get(`MediaUrl${i}`);
        const ct = params.get(`MediaContentType${i}`);
        if (url) mediaItems.push({ url, contentType: ct || "application/octet-stream", index: i });
      }
    } else {
      const jsonBody = await req.json();
      from = jsonBody.from || jsonBody.From || "";
      to = jsonBody.to || jsonBody.To || "";
      body = jsonBody.body || jsonBody.Body || jsonBody.message || "";
      messageSid = jsonBody.message_sid || jsonBody.MessageSid || "";
      messageStatus = jsonBody.MessageStatus || jsonBody.status || "";
      errorCode = jsonBody.ErrorCode || "";
    }

    // ── STATUS CALLBACK (delivery reconciliation) ──
    if (messageStatus && messageSid && !body) {
      const statusMap: Record<string, string> = {
        queued: "queued", sending: "queued", sent: "sent",
        delivered: "delivered", read: "read",
        failed: "failed", undelivered: "undelivered",
      };
      const normalizedStatus = statusMap[messageStatus.toLowerCase()] || messageStatus.toLowerCase();

      // Find channel user
      const { data: channels } = await supabase
        .from("channels")
        .select("id, user_id, workspace_id, settings")
        .eq("channel_type", "sms")
        .eq("is_enabled", true)
        .limit(100);

      const matchedChannel = (channels || []).find((ch: any) => {
        const s = ch.settings as Record<string, any> | null;
        return s?.phone_number === to || s?.twilio_phone === to || s?.phone_number === from || s?.twilio_phone === from;
      });

      if (matchedChannel) {
        // Record delivery state
        await supabase.from("message_delivery_states").insert({
          user_id: matchedChannel.user_id,
          workspace_id: matchedChannel.workspace_id,
          channel_type: "sms",
          direction: "outbound",
          provider_message_id: messageSid,
          delivery_status: normalizedStatus,
          failure_reason: errorMessage || null,
          failure_code: errorCode || null,
          status_updated_at: new Date().toISOString(),
          metadata: { message_status: messageStatus },
        } as any);

        // Update inbox message
        await supabase
          .from("inbox_messages")
          .update({ delivery_status: normalizedStatus, updated_at: new Date().toISOString() } as any)
          .eq("provider_message_id", messageSid);

        // Bounce → suppression
        if (["failed", "undelivered"].includes(normalizedStatus)) {
          const recipientPhone = from === to ? "" : (from || to);
          if (recipientPhone && ["30003", "30005", "30006", "21610", "21614"].includes(errorCode)) {
            await supabase.from("global_suppression_list").upsert({
              user_id: matchedChannel.user_id,
              contact_identifier: recipientPhone,
              channel_type: "sms",
              suppression_type: "bounce",
              reason: errorMessage || `Twilio error ${errorCode}`,
              source: "webhook",
              source_id: messageSid,
            }, { onConflict: "user_id,contact_identifier,channel_type,suppression_type" });
          }
        }
      }

      return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // ── INBOUND MESSAGE ──
    if (!from || !body) {
      return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // Deduplicate
    if (messageSid) {
      const { data: existing } = await supabase
        .from("inbox_messages")
        .select("id")
        .eq("provider_message_id", messageSid)
        .limit(1);
      if (existing && existing.length > 0) {
        return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
      }
    }

    // Find channel
    const { data: channels } = await supabase
      .from("channels")
      .select("id, user_id, workspace_id, settings")
      .eq("channel_type", "sms")
      .eq("is_enabled", true)
      .limit(100);

    const matchedChannel = (channels || []).find((ch: any) => {
      const s = ch.settings as Record<string, any> | null;
      return s?.phone_number === to || s?.twilio_phone === to;
    });

    if (!matchedChannel) {
      return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    const userId = matchedChannel.user_id;
    const workspaceId = matchedChannel.workspace_id;

    // Build media attachments
    const mediaAttachments = mediaItems.map(m => ({
      type: m.contentType.startsWith("image") ? "image" : m.contentType.startsWith("video") ? "video" : "document",
      provider_url: m.url,
      mime_type: m.contentType,
    }));

    // Thread
    const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: userId,
      _channel_type: "sms",
      _contact_identifier: from,
      _contact_name: from,
      _message_preview: body,
      _direction: "inbound",
    });

    // Keywords
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", userId)
      .eq("is_active", true);

    const textLower = body.toLowerCase();
    const matched = (keywords || [])
      .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: any) => k.keyword);
    const intentScore = matched.length > 0 ? 0.5 : 0.1;

    // Insert inbox message
    const { data: inboxMsg, error: inboxErr } = await supabase.from("inbox_messages").insert({
      user_id: userId,
      workspace_id: workspaceId,
      channel_id: matchedChannel.id,
      channel_type: "sms",
      source_name: "SMS",
      sender_name: from,
      sender_identifier: from,
      message_content: body,
      message_timestamp: new Date().toISOString(),
      intent_score: intentScore,
      matched_keywords: matched,
      is_unread: true,
      priority: matched.length > 0 ? "medium" : "normal",
      status: "new",
      direction: "inbound",
      delivery_status: "delivered",
      provider_message_id: messageSid || null,
      media_attachments: mediaAttachments,
      thread_id: threadId || null,
    } as any).select("id").single();

    if (inboxErr) console.error("[SMS] Inbox error:", inboxErr);

    // Store media records
    if (inboxMsg) {
      for (const media of mediaItems) {
        await supabase.from("message_media").insert({
          user_id: userId,
          workspace_id: workspaceId,
          inbox_message_id: inboxMsg.id,
          media_type: media.contentType.startsWith("image") ? "image" : "document",
          mime_type: media.contentType,
          provider_url: media.url,
        } as any);
      }

      // Delivery state
      await supabase.from("message_delivery_states").insert({
        user_id: userId,
        workspace_id: workspaceId,
        inbox_message_id: inboxMsg.id,
        channel_type: "sms",
        direction: "inbound",
        provider_message_id: messageSid,
        delivery_status: "delivered",
      } as any);
    }

    // Lead
    if (matched.length > 0 && intentScore >= 0.3) {
      await supabase.from("leads").insert({
        user_id: userId,
        workspace_id: workspaceId,
        message_content: body,
        source_name: from,
        source_type: "sms",
        message_date: new Date().toISOString(),
        detected_keyword: matched[0],
        intent_score: intentScore,
        status: "new",
      });
    }

    console.log(`[SMS] Processed from ${from}, keywords: ${matched.length}, media: ${mediaItems.length}`);
    return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
  } catch (e) {
    console.error("[SMS] Error:", e);
    return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }
});
