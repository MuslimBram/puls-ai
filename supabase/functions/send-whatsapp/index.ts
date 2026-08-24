import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing authorization");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) throw new Error("Unauthorized");

    const {
      to,
      message,
      workspace_id,
      channel_id,
      type = "text",
      template_name,
      template_language = "en",
      template_params,
      media_url,
      media_caption,
    } = await req.json();

    if (!workspace_id) throw new Error("workspace_id is required");
    if (!to) throw new Error("'to' phone number is required");

    const [{ data: member }, { data: owned }] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspace_id }),
      supabase.from("workspaces").select("id").eq("id", workspace_id).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) throw new Error("Forbidden: not a workspace member");

    let channelQuery = supabase
      .from("channels")
      .select("id, settings, credentials_encrypted, workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("channel_type", "whatsapp")
      .eq("is_enabled", true);
    if (channel_id) channelQuery = channelQuery.eq("id", channel_id);

    const { data: channels, error: channelError } = await channelQuery.limit(2);
    if (channelError) throw channelError;
    if (!channels?.length) throw new Error("WhatsApp not configured for this workspace");
    if (!channel_id && channels.length > 1) throw new Error("Multiple WhatsApp channels found; channel_id is required");

    const channel = channels[0];
    const settings = (channel.settings as Record<string, any> | null) || {};
    const encrypted = (channel.credentials_encrypted as Record<string, any> | null) || {};
    const encryptedToken = typeof encrypted.access_token === "string" ? encrypted.access_token : "";
    const legacyToken = typeof settings.access_token === "string" ? settings.access_token : "";
    const tokenValue = encryptedToken || legacyToken;
    const phoneNumberId = String(settings.phone_number_id || settings.waba_phone_number_id || "");

    if (!tokenValue || !phoneNumberId) {
      throw new Error("WhatsApp credentials are incomplete. Reconnect the channel securely.");
    }
    const accessToken = await decryptIfNeeded(tokenValue);

    let payload: any = { messaging_product: "whatsapp", to };
    if (type === "template" && template_name) {
      payload.type = "template";
      payload.template = { name: template_name, language: { code: template_language } };
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

    const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const waData = await waRes.json();
    if (!waRes.ok) throw new Error(waData?.error?.message || "WhatsApp API error");

    const providerMessageId = waData.messages?.[0]?.id;
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
      workspace_id,
      channel_id: channel.id,
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
        workspace_id,
        inbox_message_id: inboxMsg.id,
        channel_type: "whatsapp",
        direction: "outbound",
        provider_message_id: providerMessageId,
        delivery_status: "sent",
      } as any);
    }

    return new Response(JSON.stringify({ ok: true, message_id: providerMessageId }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[SEND-WA] Error:", e);
    const message = e instanceof Error ? e.message : "Unknown";
    const status = message.startsWith("Forbidden") ? 403 : message === "Unauthorized" || message === "Missing authorization" ? 401 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
