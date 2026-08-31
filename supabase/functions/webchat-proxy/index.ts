/**
 * webchat-proxy — trusted server-side proxy for the public chat widget.
 *
 * Security contract:
 *   browser → [this proxy] → webchat-ingest (with x-internal-secret, server-side only)
 *
 * The browser never sees or sends INTERNAL_WEBHOOK_SECRET.
 * user_id/workspace_id/business_id are NEVER trusted from the browser.
 * Channel/workspace resolution remains entirely server-side via channel_id.
 * Every accepted logical message must arrive with a caller-stable event_id so
 * network retries reuse the same idempotency boundary.
 * The browser Origin must match the channel's server-stored allowlist.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import {
  validatePublicWebchatInput,
  validateWebchatChannel,
  validateWebchatRequestOrigin,
} from "../_shared/webchat-channel-validator.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  if (!internalSecret) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const inputResult = validatePublicWebchatInput(rawBody as Record<string, unknown>);
  if (!inputResult.ok) {
    return new Response(JSON.stringify({ error: inputResult.error }), {
      status: inputResult.status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const { channel_id, message, event_id, visitor_name, visitor_email, page_url } = inputResult;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey()!);
  const { data: channelRows, error: channelErr } = await supabase
    .from("channels")
    .select("id, user_id, workspace_id, channel_type, is_enabled, settings")
    .eq("id", channel_id)
    .eq("channel_type", "website_chat");

  if (channelErr) {
    console.error("[webchat-proxy] channel lookup error:", channelErr.message);
    return new Response(JSON.stringify({ error: "Service error" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const channelResult = validateWebchatChannel(channelRows, channel_id);
  if (!channelResult.ok) {
    return new Response(JSON.stringify({ error: channelResult.error }), {
      status: channelResult.status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const originResult = validateWebchatRequestOrigin(
    channelResult.channel.settings,
    req.headers.get("origin"),
  );
  if (!originResult.ok) {
    return new Response(JSON.stringify({ error: originResult.error }), {
      status: originResult.status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const ingestUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/webchat-ingest`;
  let ingestResp: Response;
  try {
    ingestResp = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({
        channel_id,
        event_id,
        message,
        visitor_name,
        visitor_email,
        page_url,
      }),
    });
  } catch (error) {
    console.error("[webchat-proxy] ingest fetch error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(JSON.stringify({ error: "Service error" }), {
      status: 502,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  if (!ingestResp.ok) {
    return new Response(JSON.stringify({ error: "Failed to submit message" }), {
      status: ingestResp.status >= 500 ? 502 : ingestResp.status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const ingestBody = await ingestResp.json().catch(() => ({})) as { duplicate?: boolean };

  return new Response(JSON.stringify({
    ok: true,
    event_id,
    duplicate: Boolean(ingestBody.duplicate),
  }), {
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });
});
