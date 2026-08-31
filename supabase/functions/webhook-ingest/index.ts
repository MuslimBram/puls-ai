import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import {
  blocksNormalIngress,
  extractSecurityUrls,
  scanInboundContent,
} from "../_shared/content-security-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...getCors(req), "Content-Type": "application/json" },
});

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120;
const RATE_WINDOW = 60_000;
const SIGNATURE_WINDOW_SECONDS = 300;
const EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]{8,200}$/;
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/i;

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedString(value: unknown, max: number, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : fallback;
  return text.slice(0, max);
}

function secureEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    // Channel routing is outside the signed body so the service can locate the
    // per-channel signing key before trusting any caller-supplied payload field.
    const url = new URL(req.url);
    const channelId = boundedString(url.searchParams.get("channel_id"), 64);
    if (!channelId) return json(req, { error: "channel_id query parameter required" }, 400);

    if (!checkRateLimit(`${channelId}:${clientIp}`)) {
      return json(req, { error: "Too many requests" }, 429);
    }

    const eventId = boundedString(req.headers.get("x-webhook-event-id"), 200);
    const timestampHeader = boundedString(req.headers.get("x-webhook-timestamp"), 32);
    const signatureHeader = boundedString(req.headers.get("x-webhook-signature"), 80);

    if (!EVENT_ID_PATTERN.test(eventId)) {
      return json(req, { error: "valid X-Webhook-Event-Id required" }, 400);
    }

    const timestampSeconds = Number(timestampHeader);
    if (!Number.isInteger(timestampSeconds) || timestampSeconds <= 0) {
      return json(req, { error: "valid X-Webhook-Timestamp required" }, 400);
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_WINDOW_SECONDS) {
      return json(req, { error: "Webhook timestamp outside replay window" }, 401);
    }

    const signatureMatch = signatureHeader.match(SIGNATURE_PATTERN);
    if (!signatureMatch) {
      return json(req, { error: "valid X-Webhook-Signature required" }, 401);
    }

    const rawBody = await req.text();
    if (!rawBody || rawBody.length > 32_768) {
      return json(req, { error: "Invalid request body" }, 400);
    }

    let body: Record<string, unknown>;
    try {
      body = asRecord(JSON.parse(rawBody));
    } catch {
      return json(req, { error: "Invalid JSON" }, 400);
    }

    const bodyEventId = boundedString(body.event_id, 200);
    if (bodyEventId !== eventId) {
      return json(req, { error: "Body event_id must match X-Webhook-Event-Id" }, 400);
    }

    const messageContent = typeof body.message_content === "string" ? body.message_content : "";
    if (!messageContent) return json(req, { error: "message_content required" }, 400);
    if (messageContent.length > 10_000) return json(req, { error: "Message too long" }, 400);

    const metadata = asRecord(body.metadata);
    if (JSON.stringify(metadata).length > 16_384) {
      return json(req, { error: "metadata too large" }, 400);
    }

    const rawTimestamp = boundedString(body.timestamp, 64);
    if (rawTimestamp && Number.isNaN(Date.parse(rawTimestamp))) {
      return json(req, { error: "Invalid timestamp" }, 400);
    }
    const messageTimestamp = rawTimestamp
      ? new Date(rawTimestamp).toISOString()
      : new Date().toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()!,
      { auth: { persistSession: false } },
    );

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id,user_id,workspace_id,channel_type,is_enabled,credentials_encrypted")
      .eq("id", channelId)
      .eq("channel_type", "custom_webhook")
      .maybeSingle();

    if (channelError) throw channelError;
    if (!channel || !channel.is_enabled || !channel.user_id || !channel.workspace_id) {
      return json(req, { error: "Unauthorized webhook" }, 401);
    }

    const encryptedCredentials = asRecord(channel.credentials_encrypted);
    const storedCiphertext = typeof encryptedCredentials.webhook_secret === "string"
      ? encryptedCredentials.webhook_secret
      : "";
    if (!storedCiphertext) return json(req, { error: "Unauthorized webhook" }, 401);

    const storedSecret = await decryptIfNeeded(storedCiphertext);
    if (!storedSecret) return json(req, { error: "Unauthorized webhook" }, 401);

    const signingPayload = `${timestampHeader}.${eventId}.${rawBody}`;
    const expectedSignature = await hmacSha256Hex(storedSecret, signingPayload);
    if (!secureEqualHex(expectedSignature, signatureMatch[1].toLowerCase())) {
      return json(req, { error: "Unauthorized webhook" }, 401);
    }

    const workspaceId = String(channel.workspace_id);
    const userId = String(channel.user_id);

    // HMAC authentication, replay-window validation and canonical tenant
    // resolution are complete before Content Security sees the message.
    const security = await scanInboundContent({
      workspace_id: workspaceId,
      source: "custom_webhook",
      event_id: eventId,
      content: messageContent,
      urls: extractSecurityUrls(messageContent),
      attachment: null,
    });

    if (!security.ok) {
      return json(
        req,
        { error: "Content security unavailable", code: security.code },
        security.status >= 500 ? 503 : security.status,
      );
    }

    if (blocksNormalIngress(security.decision)) {
      // Do not disclose the machine security category to the external source.
      return json(req, { ok: true, accepted: true, duplicate: security.reused });
    }

    // Friendly retry fast-path only after payload-bound Content Security. The
    // unique partial index remains the authoritative race-safe Inbox boundary.
    const { data: existing, error: existingError } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("channel_id", channelId)
      .eq("provider_message_id", eventId)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return json(req, { ok: true, duplicate: true, matched: 0, lead_id: null });
    }

    const { data: keywords, error: keywordsError } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    if (keywordsError) throw keywordsError;

    const textLower = messageContent.toLowerCase();
    const matched = (keywords || [])
      .map((item: { keyword?: unknown }) => typeof item.keyword === "string" ? item.keyword : "")
      .filter((keyword: string) => keyword && textLower.includes(keyword.toLowerCase()));

    const intentScore = matched.length > 0 ? 0.5 : 0.1;
    const sourceName = boundedString(body.source_name, 160, "Webhook") || "Webhook";
    const senderName = boundedString(body.sender_name, 160, "External Source") || "External Source";
    const senderIdentifier = boundedString(body.sender_identifier, 320);

    const { data: inboxMessage, error: inboxError } = await supabase
      .from("inbox_messages")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        channel_id: channelId,
        channel_type: "custom_webhook",
        provider_message_id: eventId,
        source_name: sourceName,
        sender_name: senderName,
        sender_identifier: senderIdentifier,
        message_content: messageContent,
        message_timestamp: messageTimestamp,
        intent_score: intentScore,
        matched_keywords: matched,
        is_unread: true,
        priority: matched.length > 0 ? "medium" : "normal",
        status: "new",
        metadata: {
          ...metadata,
          external_event_id: eventId,
          ingress: "custom_webhook",
          signature_version: "v1",
          signature_timestamp: timestampSeconds,
          content_security: {
            event_id: eventId,
            category: security.decision.category,
            risk_score: security.decision.risk_score,
            action: security.decision.action,
          },
        },
      })
      .select("id")
      .single();

    if (inboxError) {
      if (inboxError.code === "23505") {
        return json(req, { ok: true, duplicate: true, matched: 0, lead_id: null });
      }
      throw inboxError;
    }

    let leadId: string | null = null;
    if (matched.length > 0 && intentScore >= 0.3) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          message_content: messageContent,
          source_name: sourceName,
          source_type: "custom_webhook",
          message_date: messageTimestamp,
          detected_keyword: matched[0],
          intent_score: intentScore,
          status: "new",
        })
        .select("id")
        .single();

      if (leadError) {
        console.error("webhook-ingest lead creation failed", {
          inbox_message_id: inboxMessage.id,
          workspace_id: workspaceId,
          code: leadError.code,
        });
      } else {
        leadId = lead?.id ?? null;
      }
    }

    return json(req, {
      ok: true,
      duplicate: false,
      inbox_message_id: inboxMessage.id,
      matched: matched.length,
      lead_id: leadId,
    });
  } catch (error) {
    console.error("webhook-ingest error", error instanceof Error ? error.message : "Unknown error");
    return json(req, { error: "Webhook processing failed" }, 500);
  }
});
