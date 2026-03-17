import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 200;
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
 * WhatsApp Cloud API Webhook
 * Handles:
 * 1. GET — Webhook verification (Meta challenge)
 * 2. POST — Incoming message processing
 *
 * Requires WHATSAPP_VERIFY_TOKEN secret for webhook verification.
 * Messages are normalized and inserted into inbox_messages + lead scoring.
 */
serve(async (req) => {
  // --- Webhook Verification (GET) ---
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && token === verifyToken) {
      console.log("[WHATSAPP] Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "whatsapp";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json();

    // WhatsApp Cloud API sends messages inside entry[].changes[].value.messages[]
    const entries = body?.entry || [];
    let processed = 0;
    let errors = 0;

    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        if (!value || change.field !== "messages") continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        // Find the channel by phone_number_id in settings
        const { data: channel } = await supabase
          .from("channels")
          .select("id, user_id, settings")
          .eq("channel_type", "whatsapp")
          .eq("is_enabled", true)
          .limit(100);

        const matchedChannel = (channel || []).find((ch: any) => {
          const s = ch.settings as Record<string, any> | null;
          return s?.phone_number_id === phoneNumberId;
        });

        if (!matchedChannel) {
          console.warn(`[WHATSAPP] No channel found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        for (const msg of messages) {
          try {
            const contact = contacts.find((c: any) => c.wa_id === msg.from);
            const senderName = contact?.profile?.name || msg.from;
            const senderIdentifier = msg.from;

            // Extract text content from various message types
            let messageContent = "";
            if (msg.type === "text") {
              messageContent = msg.text?.body || "";
            } else if (msg.type === "image") {
              messageContent = `[Image] ${msg.image?.caption || ""}`.trim();
            } else if (msg.type === "document") {
              messageContent = `[Document] ${msg.document?.filename || ""}`.trim();
            } else if (msg.type === "audio") {
              messageContent = "[Audio message]";
            } else if (msg.type === "video") {
              messageContent = `[Video] ${msg.video?.caption || ""}`.trim();
            } else if (msg.type === "location") {
              messageContent = `[Location] ${msg.location?.latitude},${msg.location?.longitude}`;
            } else if (msg.type === "sticker") {
              messageContent = "[Sticker]";
            } else {
              messageContent = `[${msg.type || "unknown"}]`;
            }

            if (!messageContent) continue;

            const timestamp = msg.timestamp
              ? new Date(parseInt(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString();

            // Keyword matching for intent scoring
            const { data: keywords } = await supabase
              .from("keywords")
              .select("keyword")
              .eq("user_id", matchedChannel.user_id)
              .eq("is_active", true);

            const textLower = messageContent.toLowerCase();
            const matched = (keywords || [])
              .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
              .map((k: any) => k.keyword);

            const intentScore = matched.length > 0 ? 0.5 : 0.1;

            // Insert into inbox
            const { error: inboxErr } = await supabase.from("inbox_messages").insert({
              user_id: matchedChannel.user_id,
              channel_id: matchedChannel.id,
              channel_type: "whatsapp",
              source_name: "WhatsApp",
              sender_name: senderName,
              sender_identifier: senderIdentifier,
              message_content: messageContent,
              message_timestamp: timestamp,
              intent_score: intentScore,
              matched_keywords: matched,
              is_unread: true,
              priority: matched.length > 0 ? "medium" : "normal",
              status: "new",
            });

            if (inboxErr) {
              console.error("[WHATSAPP] Inbox insert error:", inboxErr);
              errors++;
              continue;
            }

            // Create lead if keywords matched
            if (matched.length > 0 && intentScore >= 0.3) {
              await supabase.from("leads").insert({
                user_id: matchedChannel.user_id,
                message_content: messageContent,
                source_name: senderName,
                source_type: "whatsapp",
                message_date: timestamp,
                detected_keyword: matched[0],
                intent_score: intentScore,
                status: "new",
              });
            }

            processed++;
          } catch (msgErr) {
            console.error("[WHATSAPP] Message processing error:", msgErr);
            errors++;
          }
        }
      }
    }

    // Update channel connection status on success
    console.log(`[WHATSAPP] Processed: ${processed}, Errors: ${errors}`);

    return new Response(
      JSON.stringify({ ok: true, processed, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[WHATSAPP] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
