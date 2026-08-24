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

/** Send an Instagram DM or Facebook Messenger message using workspace-scoped encrypted credentials. */
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

    const { channel, recipient_id, message, media_url, workspace_id } = await req.json();
    if (!channel || !recipient_id || !message || !workspace_id) {
      return json(req, { error: "channel, recipient_id, message, and workspace_id are required" }, 400);
    }
    if (!["instagram", "facebook"].includes(channel)) {
      return json(req, { error: "channel must be 'instagram' or 'facebook'" }, 400);
    }

    const [{ data: member }, { data: owned }] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspace_id }),
      supabase.from("workspaces").select("id").eq("id", workspace_id).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) return json(req, { error: "Forbidden: not a workspace member" }, 403);

    const { data: channels, error: channelError } = await supabase
      .from("channels")
      .select("id,settings,credentials_encrypted,workspace_id,connection_status,is_enabled")
      .eq("workspace_id", workspace_id)
      .eq("channel_type", channel)
      .eq("is_enabled", true)
      .eq("connection_status", "connected")
      .limit(1);
    if (channelError) throw channelError;

    const ch = channels?.[0];
    if (!ch) return json(req, { error: `${channel} is not connected in this workspace` }, 400);

    const settings = asRecord(ch.settings);
    const encrypted = asRecord(ch.credentials_encrypted);
    const storedToken = encrypted.page_access_token || encrypted.access_token || settings.page_access_token || settings.access_token;
    if (!storedToken || typeof storedToken !== "string") {
      return json(req, { error: `${channel} credentials are not configured` }, 400);
    }

    const accessToken = await decryptIfNeeded(storedToken);
    const pageId = settings.page_id ? String(settings.page_id) : null;

    const messagePayload: Record<string, unknown> = {
      recipient: { id: recipient_id },
      message: media_url
        ? { attachment: { type: "image", payload: { url: media_url, is_reusable: true } } }
        : { text: message },
    };

    const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v23.0";
    const endpointId = channel === "facebook" ? (pageId || "me") : "me";
    const apiUrl = `https://graph.facebook.com/${graphVersion}/${endpointId}/messages`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    });

    const data = await res.json() as Record<string, any>;
    if (!res.ok) {
      console.error(`[SEND-META] ${channel} request failed`, { status: res.status, code: data?.error?.code });
      return json(req, { error: data?.error?.message || `${channel} API error` }, 502);
    }

    const providerMessageId = data.message_id || data.id || null;
    const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: user.id,
      _channel_type: channel,
      _contact_identifier: recipient_id,
      _contact_name: recipient_id,
      _message_preview: message,
      _direction: "outbound",
    });

    const { error: insertError } = await supabase.from("inbox_messages").insert({
      user_id: user.id,
      workspace_id,
      channel_id: ch.id,
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
    if (insertError) console.error("[SEND-META] message audit insert failed", insertError.message);

    return json(req, { ok: true, message_id: providerMessageId, workspace_id });
  } catch (error) {
    console.error("[SEND-META]", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
