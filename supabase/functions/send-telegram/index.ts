import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY not configured. Connect Telegram in settings.");

    const { chat_id, message, parse_mode, reply_to_message_id } = await req.json();
    if (!chat_id || !message) throw new Error("'chat_id' and 'message' are required");

    // Get channel record for workspace context
    const { data: channels } = await supabase
      .from("channels")
      .select("id, workspace_id")
      .eq("user_id", user.id)
      .eq("channel_type", "telegram")
      .eq("is_enabled", true)
      .limit(1);
    const channel = channels?.[0];

    // Send via connector gateway
    const tgPayload: any = { chat_id, text: message };
    if (parse_mode) tgPayload.parse_mode = parse_mode;
    if (reply_to_message_id) tgPayload.reply_to_message_id = reply_to_message_id;

    const tgRes = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tgPayload),
    });

    const tgData = await tgRes.json();
    if (!tgRes.ok || !tgData.ok) {
      console.error("[SEND-TG] Gateway error:", tgData);
      throw new Error(tgData.description || `Telegram API error [${tgRes.status}]`);
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
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[SEND-TG] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
