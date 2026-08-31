import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { verifyTwilioSignature } from "../_shared/webhook-signatures.ts";
import { extractCalledNumber, resolveWorkspaceFromCalledNumber } from "../_shared/twilio-workspace-resolver.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import {
  blocksNormalIngress,
  extractSecurityUrls,
  scanInboundContent,
} from "../_shared/content-security-client.ts";
import { stageInboundAttachment } from "../_shared/content-security-attachment-client.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 150;
const RATE_WINDOW = 60_000;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 50 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 10;
const encoder = new TextEncoder();

type MediaItem = { url: string; contentType: string; index: number };
type DownloadedMedia = MediaItem & { bytes: Uint8Array; sha256: string; mimeType: string };

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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(value: string): Promise<string> {
  return sha256Hex(encoder.encode(value));
}

function validTwilioMediaUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "api.twilio.com") return null;
    return url;
  } catch {
    return null;
  }
}

async function downloadTwilioMedia(
  item: MediaItem,
  accountSid: string,
  authToken: string,
): Promise<DownloadedMedia> {
  const url = validTwilioMediaUrl(item.url);
  if (!url || !accountSid || !authToken) throw new Error("TWILIO_MEDIA_BINDING_INVALID");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` },
    redirect: "error",
  });
  if (!response.ok) throw new Error("TWILIO_MEDIA_DOWNLOAD_FAILED");

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) {
    throw new Error("TWILIO_MEDIA_TOO_LARGE");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("TWILIO_MEDIA_TOO_LARGE");

  const responseMime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return {
    ...item,
    bytes,
    sha256: await sha256Hex(bytes),
    mimeType: responseMime || item.contentType || "application/octet-stream",
  };
}

async function claimInboundEvent(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  messageSid: string,
): Promise<"claimed" | "duplicate" | "error"> {
  const { error } = await supabase.from("processed_webhook_events").insert({
    provider: "twilio_sms",
    event_id: `twilio_sms:${messageSid}`,
    workspace_id: workspaceId,
  });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  console.error("[SMS] provider event claim failed", error.code ?? "unknown");
  return "error";
}

async function releaseInboundEvent(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  messageSid: string,
): Promise<void> {
  const { error } = await supabase.from("processed_webhook_events")
    .delete()
    .eq("provider", "twilio_sms")
    .eq("event_id", `twilio_sms:${messageSid}`)
    .eq("workspace_id", workspaceId);
  if (error) console.error("[SMS] failed to release provider claim", error.code ?? "unknown");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sms";
  if (!checkRateLimit(clientIp)) {
    return new Response("<Response></Response>", { status: 429, headers: { "Content-Type": "text/xml" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );
  let claimedWorkspaceId: string | null = null;
  let claimedMessageSid: string | null = null;

  try {
    const contentType = req.headers.get("content-type") || "";
    const rawBody = await req.text();

    let routingTo = "", routingFrom = "", routingBody = "", routingSid = "", routingStatus = "", routingCalled = "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const routingParams = new URLSearchParams(rawBody);
      routingTo = routingParams.get("To") || "";
      routingFrom = routingParams.get("From") || "";
      routingBody = routingParams.get("Body") || "";
      routingSid = routingParams.get("MessageSid") || routingParams.get("SmsSid") || "";
      routingStatus = routingParams.get("MessageStatus") || "";
      routingCalled = routingParams.get("Called") || "";
    } else if (rawBody) {
      try {
        const routingJson = JSON.parse(rawBody);
        routingTo = routingJson.to || routingJson.To || "";
        routingFrom = routingJson.from || routingJson.From || "";
        routingBody = routingJson.body || routingJson.Body || routingJson.message || "";
        routingSid = routingJson.message_sid || routingJson.MessageSid || "";
        routingStatus = routingJson.MessageStatus || routingJson.status || "";
        routingCalled = routingJson.Called || "";
      } catch {
        // Signature verification fails closed if a tenant credential cannot be resolved.
      }
    }

    const isStatusCallback = Boolean(routingStatus && routingSid && !routingBody);
    const providerOwnedNumber = isStatusCallback
      ? (routingFrom || routingCalled || routingTo)
      : (routingTo || routingCalled || extractCalledNumber(rawBody, contentType));

    const wsCreds = await resolveWorkspaceFromCalledNumber(providerOwnedNumber, ["sms", "voip"], supabase);
    const sigCheck = await verifyTwilioSignature(req, rawBody, contentType, wsCreds?.decrypted_auth_token);
    if (!sigCheck.ok) {
      console.warn(`[SMS] Twilio signature rejected: ${sigCheck.reason}`);
      return new Response("<Response></Response>", {
        status: 403,
        headers: { ...getCors(req), "Content-Type": "text/xml" },
      });
    }
    if (!wsCreds?.workspace_id || !wsCreds.channel_id || !wsCreds.user_id) {
      return new Response("<Response></Response>", {
        status: 403,
        headers: { ...getCors(req), "Content-Type": "text/xml" },
      });
    }

    const matchedChannel = wsCreds;
    const workspaceId = wsCreds.workspace_id;
    const resolvedWorkspaceId = workspaceId;
    if (!workspaceId || resolvedWorkspaceId !== workspaceId) {
      throw new Error("SMS channel is not linked to a workspace");
    }
    const userId = wsCreds.user_id;
    const channelId = wsCreds.channel_id;

    let from = "", to = "", body = "", messageSid = "", numMedia = 0;
    let messageStatus = "", errorCode = "", errorMessage = "";
    const mediaItems: MediaItem[] = [];

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      from = params.get("From") || "";
      to = params.get("To") || "";
      body = params.get("Body") || "";
      messageSid = params.get("MessageSid") || params.get("SmsSid") || "";
      numMedia = parseInt(params.get("NumMedia") || "0", 10);
      messageStatus = params.get("MessageStatus") || "";
      errorCode = params.get("ErrorCode") || "";
      errorMessage = params.get("ErrorMessage") || "";

      if (!Number.isInteger(numMedia) || numMedia < 0 || numMedia > MAX_MEDIA_ITEMS) {
        return new Response("<Response></Response>", { status: 400, headers: { "Content-Type": "text/xml" } });
      }
      for (let i = 0; i < numMedia; i++) {
        const url = params.get(`MediaUrl${i}`);
        const ct = params.get(`MediaContentType${i}`);
        if (!url) {
          console.error(`[SMS] missing MediaUrl${i} for declared NumMedia=${numMedia}`);
          return new Response("<Response></Response>", { status: 500, headers: { "Content-Type": "text/xml" } });
        }
        mediaItems.push({ url, contentType: ct || "application/octet-stream", index: i });
      }
    } else {
      const jsonBody = rawBody ? JSON.parse(rawBody) : {};
      from = jsonBody.from || jsonBody.From || "";
      to = jsonBody.to || jsonBody.To || "";
      body = jsonBody.body || jsonBody.Body || jsonBody.message || "";
      messageSid = jsonBody.message_sid || jsonBody.MessageSid || "";
      messageStatus = jsonBody.MessageStatus || jsonBody.status || "";
      errorCode = jsonBody.ErrorCode || "";
    }

    // ── STATUS CALLBACK (delivery reconciliation) ──
    if (messageStatus && messageSid && !body && mediaItems.length === 0) {
      const statusMap: Record<string, string> = {
        queued: "queued", sending: "queued", sent: "sent",
        delivered: "delivered", read: "read",
        failed: "failed", undelivered: "undelivered",
      };
      const normalizedStatus = statusMap[messageStatus.toLowerCase()] || messageStatus.toLowerCase();

      await supabase.from("message_delivery_states").insert({
        user_id: userId,
        workspace_id: workspaceId,
        channel_type: "sms",
        direction: "outbound",
        provider_message_id: messageSid,
        delivery_status: normalizedStatus,
        failure_reason: errorMessage || null,
        failure_code: errorCode || null,
        status_updated_at: new Date().toISOString(),
        metadata: { message_status: messageStatus },
      } as any);

      await supabase.from("inbox_messages")
        .update({ delivery_status: normalizedStatus, updated_at: new Date().toISOString() } as any)
        .eq("provider_message_id", messageSid)
        .eq("workspace_id", matchedChannel.workspace_id);

      if (["failed", "undelivered"].includes(normalizedStatus)) {
        const recipientPhone = from === to ? "" : (from || to);
        if (recipientPhone && ["30003", "30005", "30006", "21610", "21614"].includes(errorCode)) {
          await supabase.from("global_suppression_list").upsert({
            user_id: userId,
            contact_identifier: recipientPhone,
            channel_type: "sms",
            suppression_type: "bounce",
            reason: errorMessage || `Twilio error ${errorCode}`,
            source: "webhook",
            source_id: messageSid,
          }, { onConflict: "user_id,contact_identifier,channel_type,suppression_type" });
        }
      }

      return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // ── INBOUND MESSAGE ──
    if (!from || (!body && mediaItems.length === 0)) {
      return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }
    if (!messageSid) {
      console.error("[SMS] inbound message missing provider MessageSid");
      return new Response("<Response></Response>", { status: 400, headers: { "Content-Type": "text/xml" } });
    }

    const securityContent = body || "[attachment]";
    const securityEventId = `sms:${messageSid}`;

    const downloadedMedia: DownloadedMedia[] = [];
    if (mediaItems.length > 0) {
      let totalBytes = 0;
      for (const media of mediaItems) {
        let downloaded: DownloadedMedia;
        try {
          downloaded = await downloadTwilioMedia(media, wsCreds.account_sid, wsCreds.decrypted_auth_token);
        } catch (error) {
          console.error("[SMS] media preparation failed", error instanceof Error ? error.message : "unknown");
          return new Response("<Response></Response>", { status: 503, headers: { "Content-Type": "text/xml" } });
        }
        totalBytes += downloaded.bytes.byteLength;
        if (totalBytes > MAX_TOTAL_MEDIA_BYTES) {
          return new Response("<Response></Response>", { status: 413, headers: { "Content-Type": "text/xml" } });
        }
        downloadedMedia.push(downloaded);
      }
    }

    let aggregateAttachment: { mime_type: string; size_bytes: number; sha256: string } | null = null;
    if (downloadedMedia.length > 0) {
      const manifest = downloadedMedia.map((media) => ({
        index: media.index,
        mime_type: media.mimeType,
        byte_size: media.bytes.byteLength,
        sha256: media.sha256,
      }));
      aggregateAttachment = {
        mime_type: downloadedMedia.length === 1 ? downloadedMedia[0].mimeType : "multipart/mixed",
        size_bytes: downloadedMedia.reduce((sum, media) => sum + media.bytes.byteLength, 0),
        sha256: downloadedMedia.length === 1 ? downloadedMedia[0].sha256 : await sha256Text(JSON.stringify(manifest)),
      };
    }

    const security = await scanInboundContent({
      workspace_id: workspaceId,
      source: "sms",
      event_id: securityEventId,
      content: securityContent,
      urls: extractSecurityUrls(body),
      attachment: mediaItems.length > 0 ? aggregateAttachment : null,
    });

    if (!security.ok) {
      return new Response("<Response></Response>", {
        status: security.status >= 500 ? 500 : security.status,
        headers: { "Content-Type": "text/xml" },
      });
    }
    if (blocksNormalIngress(security.decision)) {
      if (downloadedMedia.length > 0 && security.decision.action === "quarantine") {
        for (const media of downloadedMedia) {
          const staged = await stageInboundAttachment({
            workspace_id: workspaceId,
            source: "sms",
            event_id: securityEventId,
            attachment_key: `twilio_media_${media.index}`,
            expected_attachment_count: downloadedMedia.length,
            bytes: media.bytes,
            mime_type: media.mimeType,
          });
          if (!staged.ok) {
            console.error("[SMS] attachment staging failed", staged.code);
            return new Response("<Response></Response>", {
              status: staged.retryable ? 503 : 400,
              headers: { "Content-Type": "text/xml" },
            });
          }
        }
      }
      return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    if (downloadedMedia.length > 0 || mediaItems.length > 0) {
      return new Response("<Response></Response>", { status: 500, headers: { "Content-Type": "text/xml" } });
    }

    const claim = await claimInboundEvent(supabase, workspaceId, messageSid);
    if (claim === "duplicate") {
      return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }
    if (claim === "error") {
      return new Response("<Response></Response>", { status: 500, headers: { "Content-Type": "text/xml" } });
    }
    claimedWorkspaceId = workspaceId;
    claimedMessageSid = messageSid;

    const { data: threadId, error: threadError } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: userId,
      _workspace_id: workspaceId,
      _channel_type: "sms",
      _contact_identifier: from,
      _contact_name: from,
      _message_preview: securityContent,
      _direction: "inbound",
    });
    if (threadError || !threadId) throw new Error("SMS_THREAD_PERSISTENCE_FAILED");

    const { data: keywords, error: keywordError } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    if (keywordError) throw new Error("SMS_KEYWORD_QUERY_FAILED");

    const textLower = body.toLowerCase();
    const matched = (keywords || [])
      .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: any) => k.keyword);
    const intentScore = matched.length > 0 ? 0.5 : 0.1;

    const { data: inboxMsg, error: inboxErr } = await supabase.from("inbox_messages").insert({
      user_id: userId,
      workspace_id: workspaceId,
      channel_id: channelId,
      channel_type: "sms",
      source_name: "SMS",
      sender_name: from,
      sender_identifier: from,
      message_content: securityContent,
      message_timestamp: new Date().toISOString(),
      intent_score: intentScore,
      matched_keywords: matched,
      is_unread: true,
      priority: matched.length > 0 ? "medium" : "normal",
      status: "new",
      direction: "inbound",
      delivery_status: "delivered",
      provider_message_id: messageSid,
      media_attachments: [],
      thread_id: threadId,
      metadata: {
        content_security: {
          event_id: securityEventId,
          category: security.decision.category,
          risk_score: security.decision.risk_score,
          action: security.decision.action,
        },
      },
    } as any).select("id").single();

    if (inboxErr) {
      if (inboxErr.code === "23505") {
        return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
      }
      throw new Error("SMS_INBOX_PERSISTENCE_FAILED");
    }

    const { error: deliveryError } = await supabase.from("message_delivery_states").insert({
      user_id: userId,
      workspace_id: workspaceId,
      inbox_message_id: inboxMsg.id,
      channel_type: "sms",
      direction: "inbound",
      provider_message_id: messageSid,
      delivery_status: "delivered",
    } as any);
    if (deliveryError) console.error("[SMS] delivery state insert failed", deliveryError.code ?? "unknown");

    if (matched.length > 0 && intentScore >= 0.3) {
      const { error: leadError } = await supabase.from("leads").insert({
        user_id: userId,
        workspace_id: workspaceId,
        message_content: securityContent,
        source_name: from,
        source_type: "sms",
        channel_type: "sms",
        contact_identifier: from,
        thread_id: threadId,
        inbox_message_id: inboxMsg.id,
        message_date: new Date().toISOString(),
        detected_keyword: matched[0],
        intent_score: intentScore,
        status: "new",
      });
      if (leadError) console.error("[SMS] lead insert failed", leadError.code ?? "unknown");
    }

    console.log(`[SMS] processed provider event ${messageSid}; keywords=${matched.length}; media=0`);
    return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
  } catch (error) {
    if (claimedWorkspaceId && claimedMessageSid) {
      await releaseInboundEvent(supabase, claimedWorkspaceId, claimedMessageSid);
    }
    console.error("[SMS] critical ingress error", error instanceof Error ? error.message : "unknown");
    return new Response("<Response></Response>", { status: 500, headers: { "Content-Type": "text/xml" } });
  }
});
