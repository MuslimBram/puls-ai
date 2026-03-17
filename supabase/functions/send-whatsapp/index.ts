import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Send WhatsApp message via Cloud API
 * 
 * Body:
 *   { to: string, message: string, type?: "text"|"template"|"image"|"document", template_name?: string, template_language?: string, template_params?: string[], media_url?: string, media_caption?: string }
 * 
 * Auth: Bearer token (authenticated user)
 * WhatsApp credentials from channel settings (access_token, phone_number_id)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { to, message, type = "text", template_name, template_language = "en", template_params, media_url, media_caption } = await req.json();
    if (!to) throw new Error("'to' phone number is required");

    // Get WhatsApp channel credentials
    const { data: channels } = await supabase
      .from("channels")
      .select("id, settings, workspace_id")
      .eq("user_id", user.id)
      .eq("channel_type", "whatsapp")
      .eq("is_enabled", true)
      .limit(1);

    const channel = channels?.[0];
    const settings = channel?.settings as Record<string, any> | null;
    if (!settings?.access_token || !settings?.phone_number_id) {
      throw new Error("WhatsApp not configured. Add your access token and phone number ID in channel settings.");
    }

    const phoneNumberId = settings.phone_number_id;
    const accessToken = settings.access_token;

    // Build request payload
    let payload: any = { messaging_product: "whatsapp", to };

    if (type === "template" && template_name) {
      payload.type = "template";
      payload.template = {
        name: template_name,
        language: { code: template_language },
      };
      if (template_params?.length) {
        payload.template.components = [{
          type: "body",
          parameters: template_params.map((p: string) => ({ type: "text", text: p })),
        }];
      }
    } else if (type === "image" && media_url) {
      payload.type = "image";
      payload.image = { link: media_url, caption: media_caption || "" };
    } else if (type === "document" && media_url) {
      payload.type = "document";
      payload.document = { link: media_url, caption: media_caption || "" };
    } else {
      if (!message) throw new Error("'message' is required for text messages");
      payload.type = "text";
      payload.text = { body: message, preview_url: true };
    }

    // Send via WhatsApp Cloud API
    const waRes = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const waData = await waRes.json();

    if (!waRes.ok) {
      const errMsg = waData?.error?.message || "WhatsApp API error";
      console.error("[SEND-WA] Error:", waData);
      throw new Error(errMsg);
    }

    const providerMessageId = waData.messages?.[0]?.id;

    // Store outbound in inbox + delivery state
    const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: user.id,
      _channel_type: "whatsapp",
      _contact_identifier: to,
      _contact_name: to,
      _message_preview: message || `[${type}]`,
      _direction: "outbound",
    });

    const { data: inboxMsg } = await supabase.from("inbox_messages").insert({
      user_id: user.id,
      workspace_id: channel?.workspace_id,
      channel_id: channel?.id,
      channel_type: "whatsapp",
      source_name: "WhatsApp",
      sender_name: "You",
      sender_identifier: phoneNumberId,
      message_content: message || `[${type}: ${template_name || media_url || ""}]`,
      message_timestamp: new Date().toISOString(),
      is_unread: false,
      status: "sent",
      direction: "outbound",
      delivery_status: "sent",
      provider_message_id: providerMessageId,
      thread_id: threadId || null,
    } as any).select("id").single();

    if (providerMessageId && inboxMsg) {
      await supabase.from("message_delivery_states").insert({
        user_id: user.id,
        workspace_id: channel?.workspace_id,
        inbox_message_id: inboxMsg.id,
        channel_type: "whatsapp",
        direction: "outbound",
        provider_message_id: providerMessageId,
        delivery_status: "sent",
      } as any);
    }

    return new Response(JSON.stringify({ ok: true, message_id: providerMessageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[SEND-WA] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
