import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Send Telegram message via Bot API
 * 
 * Body:
 *   { chat_id: string|number, message: string, parse_mode?: "HTML"|"Markdown", reply_to_message_id?: number }
 * 
 * Uses bot_token from user's Telegram channel settings.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { chat_id, message, parse_mode, reply_to_message_id } = await req.json();
    if (!chat_id || !message) throw new Error("'chat_id' and 'message' are required");

    // Get Telegram channel credentials
    const { data: channels } = await supabase
      .from("channels")
      .select("id, settings, workspace_id")
      .eq("user_id", user.id)
      .eq("channel_type", "telegram")
      .eq("is_enabled", true)
      .limit(1);

    const channel = channels?.[0];
    const settings = channel?.settings as Record<string, any> | null;
    const botToken = settings?.bot_token;

    if (!botToken) {
      throw new Error("Telegram not configured. Add your Bot Token in channel settings.");
    }

    // Send via Telegram Bot API
    const tgPayload: any = {
      chat_id,
      text: message,
    };
    if (parse_mode) tgPayload.parse_mode = parse_mode;
    if (reply_to_message_id) tgPayload.reply_to_message_id = reply_to_message_id;

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tgPayload),
    });

    const tgData = await tgRes.json();
    if (!tgData.ok) {
      console.error("[SEND-TG] Error:", tgData);
      throw new Error(tgData.description || "Telegram API error");
    }

    const providerMessageId = tgData.result?.message_id?.toString();

    // Store outbound message
    const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: user.id,
      _channel_type: "telegram",
      _contact_identifier: chat_id.toString(),
      _contact_name: chat_id.toString(),
      _message_preview: message,
      _direction: "outbound",
    });

    await supabase.from("inbox_messages").insert({
      user_id: user.id,
      workspace_id: channel?.workspace_id,
      channel_id: channel?.id,
      channel_type: "telegram",
      source_name: "Telegram",
      sender_name: "You",
      sender_identifier: "bot",
      message_content: message,
      message_timestamp: new Date().toISOString(),
      is_unread: false,
      status: "sent",
      direction: "outbound",
      delivery_status: "delivered",
      provider_message_id: providerMessageId,
      thread_id: threadId || null,
    } as any);

    return new Response(JSON.stringify({ ok: true, message_id: providerMessageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[SEND-TG] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
