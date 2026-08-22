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

  const unauth = requireInternalSecret(req);
  if (unauth) {
    return new Response(unauth.body, {
      status: unauth.status,
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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey()!);

  try {
    const body = await req.json();
    const { visitor_name, visitor_email, message, page_url, channel_id } = body;

    if (!channel_id || !message) {
      return new Response(JSON.stringify({ error: "channel_id and message are required" }), {
        status: 400,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (message.length > 5000) {
      return new Response(JSON.stringify({ error: "Message too long" }), {
        status: 400,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const { data: channels, error: channelErr } = await supabase
      .from("channels")
      .select("id, user_id, workspace_id, channel_type, is_enabled")
      .eq("id", channel_id)
      .eq("channel_type", "website_chat")
      .eq("is_enabled", true);

    if (channelErr) throw channelErr;
    if (!channels || channels.length !== 1) {
      return new Response(JSON.stringify({ error: "Invalid channel mapping" }), {
        status: 403,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const channel = channels[0];
    if (!channel.workspace_id) {
      console.warn("[WEBCHAT] WEBCHAT_TRUSTED_PROXY_BLOCKER: channel workspace mapping missing");
      return new Response(JSON.stringify({ error: "Channel configuration error" }), {
        status: 403,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const userId = channel.user_id;
    const workspaceId = channel.workspace_id;

    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    const textLower = String(message).toLowerCase();
    const matched = (keywords || [])
      .filter((k: { keyword: string }) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: { keyword: string }) => k.keyword);

    const intentScore = matched.length > 0 ? 0.6 : 0.2;
    const priority = matched.length > 0 ? "medium" : "normal";
    const sourceName = page_url ? `Website (${new URL(page_url).pathname})` : "Website Chat";

    const { error: inboxErr } = await supabase.from("inbox_messages").insert({
      user_id: userId,
      workspace_id: workspaceId,
      channel_id,
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

    if (inboxErr) throw inboxErr;

    let leadId = null;
    if (matched.length > 0) {
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
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
      if (leadErr) throw leadErr;
      leadId = lead?.id;
    }

    return new Response(JSON.stringify({ ok: true, matched: matched.length, lead_id: leadId }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("webchat-ingest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
