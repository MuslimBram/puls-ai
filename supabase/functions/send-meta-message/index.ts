import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Send message via Instagram DM or Facebook Messenger
 * 
 * Body:
 *   { channel: "instagram"|"facebook", recipient_id: string, message: string, media_url?: string }
 * 
 * Uses page access token from channel settings.
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

    const { channel, recipient_id, message, media_url } = await req.json();
    if (!channel || !recipient_id || !message) {
      throw new Error("channel, recipient_id, and message are required");
    }

    if (!["instagram", "facebook"].includes(channel)) {
      throw new Error("channel must be 'instagram' or 'facebook'");
    }

    // Get channel credentials
    const { data: channels } = await supabase
      .from("channels")
      .select("id, settings, workspace_id")
      .eq("user_id", user.id)
      .eq("channel_type", channel)
      .eq("is_enabled", true)
      .limit(1);

    const ch = channels?.[0];
    const settings = ch?.settings as Record<string, any> | null;
    const pageAccessToken = settings?.page_access_token || settings?.access_token;
    const pageId = settings?.page_id;

    if (!pageAccessToken) {
      throw new Error(`${channel} not configured. Add your Page Access Token in channel settings.`);
    }

    // Build message payload
    const messagePayload: any = {
      recipient: { id: recipient_id },
      message: {},
    };

    if (media_url) {
      messagePayload.message = {
        attachment: {
          type: "image",
          payload: { url: media_url, is_reusable: true },
        },
      };
    } else {
      messagePayload.message = { text: message };
    }

    // Send via Graph API
    const apiUrl = channel === "instagram"
      ? `https://graph.facebook.com/v19.0/me/messages`
      : `https://graph.facebook.com/v19.0/${pageId || "me"}/messages`;

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`[SEND-META] ${channel} error:`, data);
      throw new Error(data?.error?.message || `${channel} API error`);
    }

    const providerMessageId = data.message_id;

    // Store outbound message
    const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: user.id,
      _channel_type: channel,
      _contact_identifier: recipient_id,
      _contact_name: recipient_id,
      _message_preview: message,
      _direction: "outbound",
    });

    await supabase.from("inbox_messages").insert({
      user_id: user.id,
      workspace_id: ch?.workspace_id,
      channel_id: ch?.id,
      channel_type: channel,
      source_name: channel === "instagram" ? "Instagram" : "Facebook Messenger",
      sender_name: "You",
      sender_identifier: pageId || "me",
      message_content: message,
      message_timestamp: new Date().toISOString(),
      is_unread: false,
      status: "sent",
      direction: "outbound",
      delivery_status: "sent",
      provider_message_id: providerMessageId,
      thread_id: threadId || null,
    } as any);

    return new Response(JSON.stringify({ ok: true, message_id: providerMessageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[SEND-META] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
