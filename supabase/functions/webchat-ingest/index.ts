import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireInternalSecret } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });

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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

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
    const eventId = typeof body.event_id === "string" ? body.event_id.trim() : "";

    if (!channel_id || !message) {
      return new Response(JSON.stringify({ error: "channel_id and message are required" }), {
        status: 400,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (!eventId) {
      return new Response(JSON.stringify({ error: "event_id is required" }), {
        status: 400,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (eventId.length > 200) {
      return new Response(JSON.stringify({ error: "event_id too long" }), {
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
    if (!channel.workspace_id || !channel.user_id) {
      return new Response(JSON.stringify({ error: "Channel configuration error" }), {
        status: 403,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const userId = channel.user_id;
    const workspaceId = channel.workspace_id;

    const { data: existing, error: existingError } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("channel_id", channel_id)
      .eq("provider_message_id", eventId)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return new Response(JSON.stringify({ ok: true, duplicate: true, event_id: eventId, matched: 0, lead_id: null }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const { data: keywords, error: keywordsError } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    if (keywordsError) throw keywordsError;

    const textLower = String(message).toLowerCase();
    const matched = (keywords || [])
      .filter((k: { keyword: string }) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: { keyword: string }) => k.keyword);

    const intentScore = matched.length > 0 ? 0.6 : 0.2;
    const priority = matched.length > 0 ? "medium" : "normal";
    let sourceName = "Website Chat";
    if (page_url) {
      try {
        sourceName = `Website (${new URL(page_url).pathname})`;
      } catch {
        sourceName = "Website Chat";
      }
    }

    const { data: inboxMessage, error: inboxErr } = await supabase
      .from("inbox_messages")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        channel_id,
        channel_type: "website_chat",
        provider_message_id: eventId,
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
        metadata: { page_url, visitor_email, external_event_id: eventId },
      })
      .select("id")
      .single();

    if (inboxErr) {
      if (inboxErr.code === "23505") {
        return new Response(JSON.stringify({ ok: true, duplicate: true, event_id: eventId, matched: 0, lead_id: null }), {
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      throw inboxErr;
    }

    let leadId: string | null = null;
    if (matched.length > 0) {
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          inbox_message_id: inboxMessage.id,
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

      if (leadErr) {
        console.error("webchat-ingest lead creation failed", {
          inbox_message_id: inboxMessage.id,
          workspace_id: workspaceId,
          code: leadErr.code,
        });
      } else {
        leadId = lead?.id ?? null;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      duplicate: false,
      event_id: eventId,
      matched: matched.length,
      lead_id: leadId,
    }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("webchat-ingest error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(JSON.stringify({ error: "Webchat processing failed" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
