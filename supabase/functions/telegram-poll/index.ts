import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

Deno.serve(async () => {
  const startTime = Date.now();

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500 });

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) return new Response(JSON.stringify({ error: "TELEGRAM_API_KEY missing" }), { status: 500 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let totalProcessed = 0;

  // Read offset from telegram_bot_state
  const { data: state, error: stateErr } = await supabase
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .single();

  if (stateErr) {
    return new Response(JSON.stringify({ error: stateErr.message }), { status: 500 });
  }

  let currentOffset = state.update_offset;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;

    const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const response = await fetch(`${GATEWAY_URL}/getUpdates`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        offset: currentOffset,
        timeout,
        allowed_updates: ["message"],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data }), { status: 502 });
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    // Store messages (upsert for idempotency)
    const rows = updates
      .filter((u: any) => u.message)
      .map((u: any) => ({
        update_id: u.update_id,
        chat_id: u.message.chat.id,
        text: u.message.text ?? null,
        raw_update: u,
      }));

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from("telegram_messages")
        .upsert(rows, { onConflict: "update_id" });

      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), { status: 500 });
      }

      // Also ingest into inbox_messages for unified inbox
      for (const u of updates.filter((u: any) => u.message)) {
        const msg = u.message;
        const chatId = msg.chat.id.toString();
        const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || chatId;

        // Find workspace owner who has telegram channel
        const { data: ch } = await supabase
          .from("channels")
          .select("user_id, id, workspace_id")
          .eq("channel_type", "telegram")
          .eq("is_enabled", true)
          .limit(1);

        if (ch?.[0]) {
          const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
            _user_id: ch[0].user_id,
            _channel_type: "telegram",
            _contact_identifier: chatId,
            _contact_name: senderName,
            _message_preview: msg.text || "[media]",
            _direction: "inbound",
          });

          await supabase.from("inbox_messages").insert({
            user_id: ch[0].user_id,
            workspace_id: ch[0].workspace_id,
            channel_id: ch[0].id,
            channel_type: "telegram",
            source_name: "Telegram",
            sender_name: senderName,
            sender_identifier: chatId,
            message_content: msg.text || "[media]",
            message_timestamp: new Date(msg.date * 1000).toISOString(),
            is_unread: true,
            status: "received",
            direction: "inbound",
            delivery_status: "delivered",
            provider_message_id: msg.message_id?.toString(),
            thread_id: threadId || null,
          } as any);
        }
      }

      totalProcessed += rows.length;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await supabase
      .from("telegram_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq("id", 1);

    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed, finalOffset: currentOffset }));
});
