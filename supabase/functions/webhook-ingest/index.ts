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
const EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]{8,200}$/;

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

async function secureEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const left = new Uint8Array(aHash);
  const right = new Uint8Array(bHash);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const body = asRecord(await req.json());
    const url = new URL(req.url);
    const channelId = boundedString(url.searchParams.get("channel_id") || body.channel_id, 64);
    const eventId = boundedString(req.headers.get("x-webhook-event-id") || body.event_id, 200);
    const presentedSecret = boundedString(req.headers.get("x-webhook-secret"), 256);
    const messageContent = typeof body.message_content === "string" ? body.message_content : "";

    if (!channelId) return json(req, { error: "channel_id required" }, 400);
    if (!EVENT_ID_PATTERN.test(eventId)) return json(req, { error: "valid event_id required" }, 400);
    if (!presentedSecret) return json(req, { error: "X-Webhook-Secret required" }, 401);
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

    if (!checkRateLimit(`${channelId}:${clientIp}`)) {
      return json(req, { error: "Too many requests" }, 429);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()!,
      { auth: { persistSession: false } },
    );

    // Tenant and user identity are resolved exclusively from the canonical
    // channel row. External callers never choose a user_id/workspace_id.
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
    if (!await secureEqual(storedSecret, presentedSecret)) {
      return json(req, { error: "Unauthorized webhook" }, 401);
    }

    const workspaceId = String(channel.workspace_id);
    const userId = String(channel.user_id);

    // Authenticated shared-secret webhook + canonical tenant + caller-stable
    // event id are established before the universal content-security boundary.
    const security = await scanInboundContent({
      workspace_id: workspaceId,
      source: "custom_webhook",
      event_id: eventId,
      content: messageContent,
      urls: extractSecurityUrls(messageContent),
      attachment: null,
    });

    if (!security.ok) {
      return json(req, { error: "Content security unavailable", code: security.code }, security.status >= 500 ? 503 : security.status);
    }

    if (blocksNormalIngress(security.decision)) {
      // Do not expose the security classification to an external integration.
      return json(req, { ok: true, accepted: true, duplicate: security.reused });
    }

    // Friendly fast-path only after the payload-bound firewall decision. The
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
