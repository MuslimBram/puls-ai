import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiter
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
 * Meta Webhook — Unified handler for Instagram Graph API & Facebook Messenger
 * 
 * Routes:
 *   GET  — Webhook verification (hub.verify_token challenge)
 *   POST — Incoming messages from Instagram DMs & Facebook Messenger
 * 
 * Both platforms use the same Meta webhook format with object="instagram" or object="page".
 * Requires META_VERIFY_TOKEN secret.
 */
serve(async (req) => {
  // --- Webhook Verification (GET) ---
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
    if (mode === "subscribe" && token === verifyToken) {
      console.log("[META-WEBHOOK] Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "meta";
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
    const objectType = body?.object; // "instagram" or "page" (Facebook Messenger)
    const entries = body?.entry || [];
    let processed = 0;
    let errors = 0;

    for (const entry of entries) {
      const pageId = entry.id;

      // --- Instagram DM Messages ---
      if (objectType === "instagram") {
        const messaging = entry?.messaging || [];
        for (const event of messaging) {
          try {
            if (!event.message) continue; // skip delivery/read receipts

            const senderId = event.sender?.id;
            const messageText = event.message?.text || "";
            const attachments = event.message?.attachments || [];

            let content = messageText;
            if (!content && attachments.length > 0) {
              content = attachments.map((a: any) => `[${a.type}]`).join(" ");
            }
            if (!content) continue;

            const channelType = "instagram";
            const result = await processMessage(supabase, {
              pageId,
              channelType,
              senderId,
              senderName: senderId, // Instagram doesn't provide name in webhook
              content,
              timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
            });

            if (result.success) processed++;
            else errors++;
          } catch (e) {
            console.error("[META-WEBHOOK] Instagram message error:", e);
            errors++;
          }
        }
      }

      // --- Facebook Messenger Messages ---
      if (objectType === "page") {
        const messaging = entry?.messaging || [];
        for (const event of messaging) {
          try {
            if (!event.message) continue;

            const senderId = event.sender?.id;
            const messageText = event.message?.text || "";
            const attachments = event.message?.attachments || [];

            let content = messageText;
            if (!content && attachments.length > 0) {
              content = attachments.map((a: any) => `[${a.type}: ${a.payload?.url || ""}]`).join(" ");
            }
            if (!content) continue;

            const result = await processMessage(supabase, {
              pageId,
              channelType: "facebook",
              senderId,
              senderName: senderId,
              content,
              timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString(),
            });

            if (result.success) processed++;
            else errors++;
          } catch (e) {
            console.error("[META-WEBHOOK] Facebook message error:", e);
            errors++;
          }
        }
      }
    }

    console.log(`[META-WEBHOOK] ${objectType} — Processed: ${processed}, Errors: ${errors}`);
    return new Response(
      JSON.stringify({ ok: true, object: objectType, processed, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[META-WEBHOOK] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// --- Shared message processing ---
interface IncomingMessage {
  pageId: string;
  channelType: "instagram" | "facebook";
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}

async function processMessage(
  supabase: any,
  msg: IncomingMessage,
): Promise<{ success: boolean }> {
  // Find channel by page_id in settings
  const { data: channels } = await supabase
    .from("channels")
    .select("id, user_id, settings")
    .eq("channel_type", msg.channelType)
    .eq("is_enabled", true)
    .limit(100);

  const matchedChannel = (channels || []).find((ch: any) => {
    const s = ch.settings as Record<string, any> | null;
    return s?.page_id === msg.pageId || s?.instagram_account_id === msg.pageId;
  });

  if (!matchedChannel) {
    console.warn(`[META-WEBHOOK] No ${msg.channelType} channel for page: ${msg.pageId}`);
    return { success: false };
  }

  // Keyword matching
  const { data: keywords } = await supabase
    .from("keywords")
    .select("keyword")
    .eq("user_id", matchedChannel.user_id)
    .eq("is_active", true);

  const textLower = msg.content.toLowerCase();
  const matched = (keywords || [])
    .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
    .map((k: any) => k.keyword);

  const intentScore = matched.length > 0 ? 0.5 : 0.1;

  // Insert inbox message
  const { error: inboxErr } = await supabase.from("inbox_messages").insert({
    user_id: matchedChannel.user_id,
    channel_id: matchedChannel.id,
    channel_type: msg.channelType,
    source_name: msg.channelType === "instagram" ? "Instagram" : "Facebook Messenger",
    sender_name: msg.senderName,
    sender_identifier: msg.senderId,
    message_content: msg.content,
    message_timestamp: msg.timestamp,
    intent_score: intentScore,
    matched_keywords: matched,
    is_unread: true,
    priority: matched.length > 0 ? "medium" : "normal",
    status: "new",
  });

  if (inboxErr) {
    console.error(`[META-WEBHOOK] Inbox insert error:`, inboxErr);
    return { success: false };
  }

  // Create lead if keywords matched
  if (matched.length > 0 && intentScore >= 0.3) {
    await supabase.from("leads").insert({
      user_id: matchedChannel.user_id,
      message_content: msg.content,
      source_name: msg.senderName,
      source_type: msg.channelType,
      message_date: msg.timestamp,
      detected_keyword: matched[0],
      intent_score: intentScore,
      status: "new",
    });
  }

  return { success: true };
}
