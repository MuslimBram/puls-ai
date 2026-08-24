import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...getCors(req), "Content-Type": "application/json" },
});

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json(req, { error: "Unauthorized" }, 401);

    const {
      to,
      message,
      type = "text",
      template_name,
      template_language = "en",
      template_params,
      media_url,
      media_caption,
      workspace_id,
    } = await req.json();

    if (!to) return json(req, { error: "'to' phone number is required" }, 400);
    if (!workspace_id) return json(req, { error: "workspace_id is required" }, 400);

    const [{ data: member }, { data: owned }] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspace_id }),
      supabase.from("workspaces").select("id").eq("id", workspace_id).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) return json(req, { error: "Forbidden: not a workspace member" }, 403);

    const { data: channels, error: channelError } = await supabase
      .from("channels")
      .select("id,settings,credentials_encrypted,workspace_id,connection_status,is_enabled")
      .eq("workspace_id", workspace_id)
      .eq("channel_type", "whatsapp")
      .eq("is_enabled", true)
      .limit(1);
    if (channelError) throw channelError;

    const channel = channels?.[0];
    if (!channel) return json(req, { error: "WhatsApp is not configured in this workspace" }, 400);

    const settings = asRecord(channel.settings);
    const credentials = asRecord(channel.credentials_encrypted);
    const phoneNumberId = settings.phone_number_id || settings.waba_phone_number_id;
    const storedToken = credentials.access_token || settings.access_token;
    if (!phoneNumberId || !storedToken || typeof storedToken !== "string") {
      return json(req, { error: "WhatsApp credentials are incomplete" }, 400);
    }

    const accessToken = await decryptIfNeeded(storedToken);

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
      if (!message) return json(req, { error: "'message' is required for text messages" }, 400);
      payload.type = "text";
      payload.text = { body: message, preview_url: true };
    }

    const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v23.0";
    const waRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const waData = await waRes.json() as Record<string, any>;
    if (!waRes.ok) {
      console.error("[SEND-WA] provider request failed", { status: waRes.status, code: waData?.error?.code });
      return json(req, { error: waData?.error?.message || "WhatsApp API error" }, 502);
    }

    const providerMessageId = waData.messages?.[0]?.id;
    const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: user.id,
      _channel_type: "whatsapp",
      _contact_identifier: to,
      _contact_name: to,
      _message_preview: message || `[${type}]`,
      _direction: "outbound",
    });

    const { data: inboxMsg, error: inboxError } = await supabase.from("inbox_messages").insert({
      user_id: user.id,
      workspace_id,
      channel_id: channel.id,
      channel_type: "whatsapp",
      source_name: "WhatsApp",
      sender_name: "You",
      sender_identifier: String(phoneNumberId),
      message_content: message || `[${type}: ${template_name || media_url || ""}]`,
      message_timestamp: new Date().toISOString(),
      is_unread: false,
      status: "sent",
      direction: "outbound",
      delivery_status: "sent",
      provider_message_id: providerMessageId,
      thread_id: threadId || null,
    } as any).select("id").single();
    if (inboxError) console.error("[SEND-WA] inbox audit insert failed", inboxError.message);

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

    return json(req, { ok: true, message_id: providerMessageId, workspace_id });
  } catch (error) {
    console.error("[SEND-WA]", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
