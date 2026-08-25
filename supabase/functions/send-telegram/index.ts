import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

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
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { chat_id, message, parse_mode, reply_to_message_id, workspace_id } = await req.json();
    if (!chat_id || !message) throw new Error("'chat_id' and 'message' are required");
    if (!workspace_id) throw new Error("'workspace_id' is required");

    const [{ data: member }, { data: owned }] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspace_id }),
      supabase.from("workspaces").select("id").eq("id", workspace_id).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) throw new Error("Forbidden: not a workspace member");

    const { data: channels, error: channelError } = await supabase
      .from("channels")
      .select("id, workspace_id, credentials_encrypted")
      .eq("workspace_id", workspace_id)
      .eq("channel_type", "telegram")
      .eq("is_enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (channelError) throw channelError;
    const channel = channels?.[0];
    if (!channel) throw new Error("No active Telegram channel. Reconnect Telegram in settings.");

    const credentials = (channel.credentials_encrypted || {}) as Record<string, unknown>;
    const encryptedToken = typeof credentials.bot_token === "string" ? credentials.bot_token : "";
    const botToken = encryptedToken
      ? await decryptIfNeeded(encryptedToken)
      : (Deno.env.get("TELEGRAM_BOT_TOKEN") || "");
    if (!botToken) {
      throw new Error("Telegram bot token is not configured. Reconnect Telegram in settings.");
    }

    const tgPayload: Record<string, unknown> = { chat_id, text: message };
    if (parse_mode) tgPayload.parse_mode = parse_mode;
    if (reply_to_message_id) tgPayload.reply_to_message_id = reply_to_message_id;

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tgPayload),
    });

    const tgData = await tgRes.json().catch(() => ({})) as Record<string, any>;
    if (!tgRes.ok || !tgData.ok) {
      console.error("[SEND-TG] Telegram API error:", tgData);
      throw new Error(String(tgData.description || `Telegram API error [${tgRes.status}]`));
    }

    const providerMessageId = tgData.result?.message_id?.toString();

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
      workspace_id,
      channel_id: channel.id,
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
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[SEND-TG] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
