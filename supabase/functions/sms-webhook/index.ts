import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiter
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
 * SMS Webhook — Receives inbound SMS from Twilio (or compatible providers)
 * 
 * Twilio sends SMS callbacks as application/x-www-form-urlencoded with fields:
 *   From, To, Body, MessageSid, AccountSid, NumMedia, etc.
 * 
 * This function:
 * 1. Parses the Twilio webhook payload
 * 2. Matches the "To" number to a channel in the database
 * 3. Inserts normalized message into inbox_messages
 * 4. Scores and creates leads if keywords match
 * 5. Returns TwiML empty response (Twilio expects XML)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sms";
  if (!checkRateLimit(clientIp)) {
    return new Response("<Response></Response>", {
      status: 429,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Twilio sends form-urlencoded data
    let from = "";
    let to = "";
    let body = "";
    let messageSid = "";
    let numMedia = 0;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.text();
      const params = new URLSearchParams(formData);
      from = params.get("From") || "";
      to = params.get("To") || "";
      body = params.get("Body") || "";
      messageSid = params.get("MessageSid") || "";
      numMedia = parseInt(params.get("NumMedia") || "0", 10);

      // Collect media URLs if present
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params.get(`MediaUrl${i}`);
        const mediaType = params.get(`MediaContentType${i}`);
        if (mediaUrl) {
          body += ` [Media: ${mediaType || "file"} ${mediaUrl}]`;
        }
      }
    } else {
      // Fallback: JSON payload (for custom SMS providers)
      const jsonBody = await req.json();
      from = jsonBody.from || jsonBody.From || "";
      to = jsonBody.to || jsonBody.To || "";
      body = jsonBody.body || jsonBody.Body || jsonBody.message || "";
      messageSid = jsonBody.message_sid || jsonBody.MessageSid || "";
    }

    if (!from || !body) {
      console.warn("[SMS-WEBHOOK] Missing from or body");
      return new Response("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Deduplicate by MessageSid
    if (messageSid) {
      const { data: existing } = await supabase
        .from("inbox_messages")
        .select("id")
        .eq("channel_type", "sms")
        .eq("sender_identifier", from)
        .eq("message_content", body)
        .gte("message_timestamp", new Date(Date.now() - 60_000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`[SMS-WEBHOOK] Duplicate message skipped: ${messageSid}`);
        return new Response("<Response></Response>", {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      }
    }

    // Find channel by phone number in settings
    const { data: channels } = await supabase
      .from("channels")
      .select("id, user_id, settings")
      .eq("channel_type", "sms")
      .eq("is_enabled", true)
      .limit(100);

    const matchedChannel = (channels || []).find((ch: any) => {
      const s = ch.settings as Record<string, any> | null;
      return s?.phone_number === to || s?.twilio_phone === to;
    });

    if (!matchedChannel) {
      console.warn(`[SMS-WEBHOOK] No channel found for number: ${to}`);
      return new Response("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Keyword matching
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", matchedChannel.user_id)
      .eq("is_active", true);

    const textLower = body.toLowerCase();
    const matched = (keywords || [])
      .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: any) => k.keyword);

    const intentScore = matched.length > 0 ? 0.5 : 0.1;

    // Insert inbox message
    const { error: inboxErr } = await supabase.from("inbox_messages").insert({
      user_id: matchedChannel.user_id,
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
    });

    if (inboxErr) {
      console.error("[SMS-WEBHOOK] Inbox insert error:", inboxErr);
    }

    // Create lead if keywords matched
    if (matched.length > 0 && intentScore >= 0.3) {
      await supabase.from("leads").insert({
        user_id: matchedChannel.user_id,
        message_content: body,
        source_name: from,
        source_type: "sms",
        message_date: new Date().toISOString(),
        detected_keyword: matched[0],
        intent_score: intentScore,
        status: "new",
      });
    }

    console.log(`[SMS-WEBHOOK] Processed SMS from ${from}, keywords: ${matched.length}`);

    // Twilio expects TwiML response
    return new Response("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (e) {
    console.error("[SMS-WEBHOOK] Error:", e);
    return new Response("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
});
