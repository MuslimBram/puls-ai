/**
 * webchat-ingest — SOCIAL-0 hardened
 *
 * Tenant resolution:
 *   Caller supplies channel_id (the widget embed token).
 *   Server resolves workspace_id and user_id from channels table.
 *   Body-provided user_id is NEVER used as authoritative tenant identity.
 *
 * Fail-closed rules:
 *   - No channel_id → 400 rejected
 *   - channel_id not found or not enabled → 404 rejected
 *   - All tenant-scoped DB writes use workspace_id/user_id from the resolved channel record.
 *
 * Internal-secret protection is preserved (unchanged).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireInternalSecret } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
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

  // SECURITY: require internal shared secret
  const unauth = requireInternalSecret(req);
  if (unauth) return new Response(unauth.body, { status: unauth.status, headers: { ...getCors(req), "Content-Type": "application/json" } });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
  );

  try {
    const body = await req.json();
    // NOTE: body.user_id is intentionally NOT used as the tenant identity.
    // Tenant is resolved server-side from channel_id.
    const { channel_id, visitor_name, visitor_email, message, page_url } = body;

    if (!channel_id || !message) {
      return new Response(JSON.stringify({ error: "channel_id and message are required" }), {
        status: 400, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (message.length > 5000) {
      return new Response(JSON.stringify({ error: "Message too long" }), {
        status: 400, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // Server-side tenant resolution from channel record.
    // workspace_id and user_id come ONLY from the DB — never from the body.
    const { data: channel, error: channelErr } = await supabase
      .from("channels")
      .select("id, workspace_id, user_id")
      .eq("id", channel_id)
      .eq("channel_type", "website_chat")
      .eq("is_enabled", true)
      .maybeSingle();

    if (channelErr) {
      console.error("[WEBCHAT] channel lookup error:", channelErr.message);
      return new Response(JSON.stringify({ error: "Channel resolution failed" }), {
        status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (!channel) {
      return new Response(JSON.stringify({ error: "Channel not found or disabled" }), {
        status: 404, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // Authoritative tenant identifiers from DB — NOT from request body.
    const resolvedUserId = channel.user_id as string;
    const resolvedWorkspaceId = channel.workspace_id as string | null;

    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", resolvedUserId)
      .eq("is_active", true);

    const textLower = message.toLowerCase();
    const matched = (keywords || [])
      .filter((k: { keyword: string }) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: { keyword: string }) => k.keyword);

    const intentScore = matched.length > 0 ? 0.6 : 0.2;
    const priority = matched.length > 0 ? "medium" : "normal";
    const sourceName = page_url ? `Website (${new URL(page_url).pathname})` : "Website Chat";

    const { error: inboxErr } = await supabase.from("inbox_messages").insert({
      user_id: resolvedUserId,
      workspace_id: resolvedWorkspaceId ?? undefined,
      channel_id: channel.id,
      channel_type: "website_chat",
      source_name: sourceName,
      sender_name: visitor_name || "Website Visitor",
      sender_identifier: visitor_email || "",
      message_content: message,
      message_timestamp: new Date().toISOString(),
      intent_score: intentScore,
      matched_keywords: matched,
      is_unread: true,
      priority,
      status: "new",
      metadata: { page_url, visitor_email },
    });

    if (inboxErr) console.error("[WEBCHAT] Inbox insert error:", inboxErr.message);

    let leadId = null;
    if (matched.length > 0) {
      const { data: lead } = await supabase
        .from("leads")
        .insert({
          user_id: resolvedUserId,
          workspace_id: resolvedWorkspaceId ?? undefined,
          message_content: message,
          source_name: sourceName,
          source_type: "website_chat",
          message_date: new Date().toISOString(),
          detected_keyword: matched[0],
          intent_score: intentScore,
          status: "new",
        })
        .select("id")
        .single();
      leadId = lead?.id;
    }

    return new Response(JSON.stringify({ ok: true, matched: matched.length, lead_id: leadId }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[WEBCHAT] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
