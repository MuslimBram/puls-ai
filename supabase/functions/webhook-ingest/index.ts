import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120;
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { user_id, channel_type, source_name, sender_name, sender_identifier, message_content, timestamp, channel_id, metadata } = body;

    if (!user_id || !message_content) {
      return new Response(JSON.stringify({ error: "user_id and message_content are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (message_content.length > 10000) {
      return new Response(JSON.stringify({ error: "Message too long" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Keyword matching
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", user_id)
      .eq("is_active", true);

    const textLower = message_content.toLowerCase();
    const matched = (keywords || [])
      .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: any) => k.keyword);

    const intentScore = matched.length > 0 ? 0.5 : 0.1;
    const msgTimestamp = timestamp || new Date().toISOString();

    const { error: inboxErr } = await supabase.from("inbox_messages").insert({
      user_id,
      channel_id: channel_id || null,
      channel_type: channel_type || "custom_webhook",
      source_name: source_name || "Webhook",
      sender_name: sender_name || "External Source",
      sender_identifier: sender_identifier || "",
      message_content,
      message_timestamp: msgTimestamp,
      intent_score: intentScore,
      matched_keywords: matched,
      is_unread: true,
      priority: matched.length > 0 ? "medium" : "normal",
      status: "new",
      metadata: metadata || {},
    });

    if (inboxErr) console.error("Inbox insert error:", inboxErr);

    let leadId = null;
    if (matched.length > 0 && intentScore >= 0.3) {
      const { data: lead } = await supabase
        .from("leads")
        .insert({
          user_id,
          message_content,
          source_name: source_name || "Webhook",
          source_type: channel_type || "custom_webhook",
          message_date: msgTimestamp,
          detected_keyword: matched[0],
          intent_score: intentScore,
          status: "new",
        })
        .select("id")
        .single();
      leadId = lead?.id;
    }

    return new Response(JSON.stringify({ ok: true, matched: matched.length, lead_id: leadId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("webhook-ingest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
