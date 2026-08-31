/**
 * whatsapp-webhook — WhatsApp Cloud API events
 *
 * verified Meta signature -> exact phone_number_id tenant resolution -> content security
 * -> provider claim -> idempotent Inbox/thread/lead repair path.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { verifyMetaSignature } from "../_shared/webhook-signatures.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import {
  blocksNormalIngress,
  extractSecurityUrls,
  scanInboundContent,
} from "../_shared/content-security-client.ts";
import { stageInboundAttachment } from "../_shared/content-security-attachment-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });
const rateLimitMap = new Map<string, { n: number; resetAt: number }>();
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const META_GRAPH_VERSION = "v19.0";
const encoder = new TextEncoder();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { n: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.n >= 200) return false;
  entry.n++;
  return true;
}

type ChannelRow = {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  settings: Record<string, unknown> | null;
  credentials_encrypted: Record<string, unknown> | null;
};

type WhatsAppAttachmentShape = {
  mime_type: string;
  media_id: string;
};

type WhatsAppMessageShape = {
  content: string;
  attachment: WhatsAppAttachmentShape | null;
};

type DownloadedMedia = {
  bytes: Uint8Array;
  mime_type: string;
  sha256: string;
};

function normalizeMessage(msg: Record<string, any>): WhatsAppMessageShape {
  if (msg.type === "text" && typeof msg.text?.body === "string") {
    return { content: msg.text.body, attachment: null };
  }

  if (msg.type === "interactive") {
    const button = msg.interactive?.button_reply;
    if (button) {
      return {
        content: String(button.title || button.id || "[interactive_button]"),
        attachment: null,
      };
    }
    const list = msg.interactive?.list_reply;
    if (list) {
      return {
        content: [list.title, list.description, list.id].filter(Boolean).join(" ") || "[interactive_list]",
        attachment: null,
      };
    }
    return { content: "[interactive]", attachment: null };
  }

  const mediaTypes = new Set(["image", "audio", "video", "document", "sticker"]);
  if (mediaTypes.has(String(msg.type || ""))) {
    const media = msg[msg.type] ?? {};
    const mimeType = typeof media.mime_type === "string" && media.mime_type.trim()
      ? media.mime_type.trim().toLowerCase()
      : "application/octet-stream";
    const mediaId = typeof media.id === "string" ? media.id.trim() : "";
    const caption = typeof media.caption === "string" && media.caption.trim()
      ? media.caption
      : typeof msg.caption === "string" && msg.caption.trim()
        ? msg.caption
        : `[whatsapp_media:${String(msg.type)}]`;
    return { content: caption, attachment: { mime_type: mimeType, media_id: mediaId } };
  }

  return { content: `[whatsapp_event:${String(msg.type || "unknown")}]`, attachment: null };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isAllowedWhatsAppMediaHost(url: URL): boolean {
  return url.protocol === "https:"
    && (url.hostname === "lookaside.fbsbx.com" || url.hostname === "lookaside.facebook.com");
}

async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string,
  fallbackMime: string,
): Promise<DownloadedMedia> {
  if (!mediaId) throw new Error("WHATSAPP_MEDIA_ID_MISSING");

  const metadataResponse = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(mediaId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "error",
    },
  );
  const metadata = await metadataResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!metadataResponse.ok || typeof metadata.url !== "string") {
    throw new Error("WHATSAPP_MEDIA_METADATA_FAILED");
  }

  const declaredSize = Number(metadata.file_size ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_MEDIA_BYTES) {
    throw new Error("WHATSAPP_MEDIA_TOO_LARGE");
  }

  let mediaUrl: URL;
  try {
    mediaUrl = new URL(metadata.url);
  } catch {
    throw new Error("WHATSAPP_MEDIA_URL_INVALID");
  }
  if (!isAllowedWhatsAppMediaHost(mediaUrl)) {
    throw new Error("WHATSAPP_MEDIA_HOST_REJECTED");
  }

  const mediaResponse = await fetch(mediaUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "error",
  });
  if (!mediaResponse.ok) throw new Error("WHATSAPP_MEDIA_DOWNLOAD_FAILED");

  const contentLength = Number(mediaResponse.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BYTES) {
    throw new Error("WHATSAPP_MEDIA_TOO_LARGE");
  }

  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("WHATSAPP_MEDIA_TOO_LARGE");
  if (Number.isFinite(declaredSize) && declaredSize > 0 && declaredSize !== bytes.byteLength) {
    throw new Error("WHATSAPP_MEDIA_SIZE_MISMATCH");
  }

  const actualSha256 = await sha256Hex(bytes);
  const providerSha = typeof metadata.sha256 === "string" ? metadata.sha256.trim().toLowerCase() : "";
  if (providerSha && providerSha !== actualSha256) {
    throw new Error("WHATSAPP_MEDIA_HASH_MISMATCH");
  }

  const responseMime = (mediaResponse.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const metadataMime = typeof metadata.mime_type === "string" ? metadata.mime_type.trim().toLowerCase() : "";
  const mimeType = responseMime || metadataMime || fallbackMime || "application/octet-stream";

  return { bytes, mime_type: mimeType, sha256: actualSha256 };
}

async function claimEvent(
  sb: ReturnType<typeof createClient>,
  eventId: string,
  workspaceId: string,
): Promise<"claimed" | "duplicate" | "error"> {
  const { error } = await sb.from("processed_webhook_events")
    .insert({ provider: "whatsapp", event_id: `whatsapp:${eventId}`, workspace_id: workspaceId });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  return "error";
}

async function releaseEventClaim(
  sb: ReturnType<typeof createClient>,
  eventId: string,
  workspaceId: string,
): Promise<void> {
  await sb.from("processed_webhook_events")
    .delete()
    .eq("provider", "whatsapp")
    .eq("event_id", `whatsapp:${eventId}`)
    .eq("workspace_id", workspaceId);
}

async function ensureInboxMessage(
  sb: ReturnType<typeof createClient>,
  params: {
    channel: ChannelRow & { user_id: string; workspace_id: string };
    waId: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: string;
    phoneNumberId: string;
    messageType: string;
    threadId: string;
    securityEventId: string;
    security: { category: string; risk_score: number; action: string };
  },
): Promise<string> {
  const ch = params.channel;
  const { data: existing, error: lookupError } = await sb
    .from("inbox_messages")
    .select("id")
    .eq("workspace_id", ch.workspace_id)
    .eq("channel_id", ch.id)
    .eq("provider_message_id", params.waId)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id;

  const { data: inserted, error: insertError } = await sb.from("inbox_messages").insert({
    user_id:            ch.user_id,
    workspace_id:       ch.workspace_id,
    channel_id:         ch.id,
    channel_type: "whatsapp",
    source_name: "WhatsApp",
    sender_name: params.senderName,
    sender_identifier: params.senderId,
    message_content: params.content,
    message_timestamp: params.timestamp,
    direction: "inbound",
    status: "received",
    delivery_status: "delivered",
    provider_message_id: params.waId,
    thread_id: params.threadId,
    is_unread: true,
    metadata: {
      waba_phone: params.phoneNumberId,
      wa_id: params.senderId,
      type: params.messageType,
      content_security: {
        event_id: params.securityEventId,
        category: params.security.category,
        risk_score: params.security.risk_score,
        action: params.security.action,
      },
    },
  }).select("id").single();

  if (!insertError && inserted?.id) return inserted.id;
  if (insertError?.code === "23505") {
    const { data: winner, error: winnerError } = await sb
      .from("inbox_messages")
      .select("id")
      .eq("workspace_id", ch.workspace_id)
      .eq("channel_id", ch.id)
      .eq("provider_message_id", params.waId)
      .limit(1)
      .maybeSingle();
    if (!winnerError && winner?.id) return winner.id;
  }
  throw new Error("WHATSAPP_INBOX_PERSIST_FAILED");
}

async function ensureLead(
  sb: ReturnType<typeof createClient>,
  workspaceId: string,
  senderId: string,
): Promise<string> {
  const { data: lead, error } = await sb.from("leads").upsert({
    workspace_id: workspaceId,
    channel_type: "whatsapp",
    contact_identifier: senderId,
    source_type: "whatsapp",
    status: "new",
  }, { onConflict: "workspace_id,contact_identifier" }).select("id").single();
  if (error || !lead?.id) throw new Error("WHATSAPP_LEAD_PERSIST_FAILED");
  return lead.id;
}

serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "wa";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const rawBody = await req.text();
    const signature = await verifyMetaSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      "WHATSAPP_APP_SECRET",
    );
    if (!signature.ok) {
      const status = signature.reason === "secret_not_configured" ? 503 : 403;
      return new Response(JSON.stringify({ error: signature.reason }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(rawBody);
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let processed = 0;
    let quarantined = 0;

    const { data: channels, error: channelsError } = await sb.from("channels")
      .select("id,user_id,workspace_id,settings,credentials_encrypted")
      .eq("channel_type", "whatsapp")
      .eq("is_enabled", true);
    if (channelsError) throw channelsError;

    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        const phoneNumberId = typeof value.metadata?.phone_number_id === "string"
          ? value.metadata.phone_number_id
          : "";

        if (!phoneNumberId) {
          quarantined += messages.length || 1;
          continue;
        }

        const matches = (channels || []).filter((candidate) => {
          const settings = (candidate.settings as Record<string, unknown> | null) ?? {};
          return settings.phone_number_id === phoneNumberId
            || settings.waba_phone_number_id === phoneNumberId;
        });
        if (matches.length !== 1 || !matches[0].workspace_id || !matches[0].user_id) {
          console.warn("[WA] Ambiguous channel mapping for phone_number_id", phoneNumberId, "matches:", matches.length);
          quarantined += messages.length || 1;
          continue;
        }

        const channel = matches[0] as ChannelRow & { user_id: string; workspace_id: string };

        // Delivery status is not untrusted message content. Keep it lightweight,
        // but tenant-bind it to the resolved WhatsApp workspace.
        for (const statusEvent of statuses) {
          if (!statusEvent?.id) continue;
          const { error: statusError } = await sb.from("inbox_messages")
            .update({ delivery_status: statusEvent.status, updated_at: new Date().toISOString() })
            .eq("provider_message_id", statusEvent.id)
            .eq("workspace_id", channel.workspace_id)
            .eq("channel_id", channel.id);
          if (statusError) console.warn("[WA] delivery status update failed", statusError.code ?? "unknown");
        }

        for (const msg of messages) {
          const waId = typeof msg?.id === "string" ? msg.id.trim() : "";
          const senderId = typeof msg?.from === "string" ? msg.from.trim() : "";
          if (!waId || !senderId) {
            // A provider-native stable event ID is mandatory.
            quarantined++;
            continue;
          }

          const contact = contacts.find((candidate: any) => candidate.wa_id === senderId);
          const senderName = contact?.profile?.name ?? senderId;
          const normalized = normalizeMessage(msg);
          const securityEventId = `wa:${waId}`;

          let downloaded: DownloadedMedia | null = null;
          if (normalized.attachment) {
            const settings = (channel.settings ?? {}) as Record<string, unknown>;
            const encrypted = (channel.credentials_encrypted ?? {}) as Record<string, unknown>;
            const encryptedToken = typeof encrypted.access_token === "string" ? encrypted.access_token : "";
            const legacyToken = typeof settings.access_token === "string" ? settings.access_token : "";
            const tokenValue = encryptedToken || legacyToken;
            if (!tokenValue || !normalized.attachment.media_id) {
              return new Response(JSON.stringify({ error: "whatsapp_media_credentials_unavailable" }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
              });
            }

            let accessToken: string;
            try {
              accessToken = await decryptIfNeeded(tokenValue);
              downloaded = await downloadWhatsAppMedia(
                normalized.attachment.media_id,
                accessToken,
                normalized.attachment.mime_type,
              );
            } catch (error) {
              console.error("[WA] media preparation failed", error instanceof Error ? error.message : "unknown");
              return new Response(JSON.stringify({ error: "whatsapp_media_preparation_failed" }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
              });
            }
          }

          const security = await scanInboundContent({
            workspace_id: channel.workspace_id,
            source: "whatsapp",
            event_id: securityEventId,
            content: normalized.content,
            urls: extractSecurityUrls(normalized.content),
            attachment: normalized.attachment
              ? {
                  mime_type: downloaded?.mime_type ?? normalized.attachment.mime_type,
                  size_bytes: downloaded?.bytes.byteLength,
                  sha256: downloaded?.sha256,
                }
              : null,
          });
          if (!security.ok) {
            return new Response(JSON.stringify({ error: "content_security_unavailable" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (blocksNormalIngress(security.decision)) {
            if (downloaded && normalized.attachment && security.decision.action === "quarantine") {
              const staged = await stageInboundAttachment({
                workspace_id: channel.workspace_id,
                source: "whatsapp",
                event_id: securityEventId,
                attachment_key: "wa_media_0",
                expected_attachment_count: 1,
                bytes: downloaded.bytes,
                mime_type: downloaded.mime_type,
              });
              if (!staged.ok) {
                console.error("[WA] attachment staging failed", staged.code);
                return new Response(JSON.stringify({ error: "whatsapp_attachment_staging_failed" }), {
                  status: staged.retryable ? 503 : 400,
                  headers: { "Content-Type": "application/json" },
                });
              }
            }
            quarantined++;
            processed++;
            continue;
          }

          // Attachment-bearing content is expected to remain quarantined until
          // the real malware layer completes; never insert media into normal Inbox.
          if (downloaded || normalized.attachment) {
            return new Response(JSON.stringify({ error: "attachment_security_contract_violation" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const claim = await claimEvent(sb, waId, channel.workspace_id);
          if (claim === "error") {
            return new Response(JSON.stringify({ error: "provider_claim_failed" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Duplicate provider retries execute the same idempotent repair path.
          const { data: threadId, error: threadError } = await sb.rpc("upsert_conversation_thread", {
            _user_id: channel.user_id,
            _workspace_id: channel.workspace_id,
            _channel_type: "whatsapp",
            _contact_identifier: senderId,
            _contact_name: senderName,
            _message_preview: normalized.content,
            _direction: "inbound",
          });
          if (threadError || !threadId) throw new Error("WHATSAPP_THREAD_PERSIST_FAILED");

          const timestampSeconds = Number(msg.timestamp);
          const messageTimestamp = Number.isFinite(timestampSeconds) && timestampSeconds > 0
            ? new Date(timestampSeconds * 1000).toISOString()
            : new Date().toISOString();

          try {
            await ensureInboxMessage(sb, {
              channel,
              waId,
              senderId,
              senderName,
              content: normalized.content,
              timestamp: messageTimestamp,
              phoneNumberId,
              messageType: String(msg.type || "unknown"),
              threadId,
              securityEventId,
              security: security.decision,
            });
          } catch (inboxErr) {
            console.error("[WA] Inbox persistence failed", inboxErr instanceof Error ? inboxErr.message : "unknown");
            await releaseEventClaim(sb, waId, channel.workspace_id);
            throw inboxErr;
          }

          const leadId = await ensureLead(sb, channel.workspace_id, senderId);

          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getServiceKey()}`,
              "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
            },
            body: JSON.stringify({
              action: "feedback",
              workspace_id: channel.workspace_id,
              lead_id: leadId,
              event_type: "replied",
              channel: "whatsapp",
              event_data: { wa_id: senderId, msg_id: waId, waba_phone: phoneNumberId },
            }),
          }).catch(() => {});

          if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
            const button = msg.interactive.button_reply;
            if (typeof button?.id === "string" && button.id.startsWith("OPT_OUT")) {
              const { error: consentError } = await sb.from("contact_consent").upsert({
                workspace_id: channel.workspace_id,
                lead_id: leadId,
                channel: "whatsapp",
                consented: false,
                opt_out_date: new Date().toISOString(),
                opt_out_reason: "user_opt_out",
              }, { onConflict: "workspace_id,lead_id,channel" });
              if (consentError) throw new Error("WHATSAPP_CONSENT_PERSIST_FAILED");
            }
          }

          processed++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, quarantined }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[WA-WEBHOOK] processing failed", error instanceof Error ? error.message : "unknown");
    return new Response(JSON.stringify({ error: "whatsapp_processing_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
