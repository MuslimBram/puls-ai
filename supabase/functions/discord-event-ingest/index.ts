import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

export interface DiscordInboundEventPayload {
  workspace_id: string;
  guild_id?: string;
  channel_id: string;
  message_id: string;
  author: {
    id: string;
    username: string;
    bot?: boolean;
  };
  content: string;
  reply_to_message_id?: string;
  timestamp?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  // 1. STRICT INTERNAL AUTHENTICATION ONLY (Ordinary user JWTs & public requests REJECTED!)
  const internalAuthErr = requireCronAuth(req);
  const internalSecretHeader = req.headers.get("x-internal-secret");
  const expectedSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");

  const isInternalSecretOk =
    Boolean(expectedSecret) && Boolean(internalSecretHeader) && internalSecretHeader === expectedSecret;

  if (internalAuthErr !== null && !isInternalSecretOk) {
    return json(req, { error: "Forbidden: Internal Gateway secret required" }, 403);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  let body: DiscordInboundEventPayload;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }

  const { workspace_id, channel_id, message_id, author, content } = body;

  if (!workspace_id || !channel_id || !message_id || !author || !content) {
    return json(req, { error: "Missing required fields: workspace_id, channel_id, message_id, author, content" }, 400);
  }

  // 2. VALIDATE WORKSPACE & CHANNEL MAPPING BEFORE ANY WRITE
  const { data: channelRecord } = await supabaseAdmin
    .from("channels")
    .select("id, provider_metadata")
    .eq("workspace_id", workspace_id)
    .eq("channel_type", "discord")
    .eq("connection_status", "connected")
    .maybeSingle();

  if (!channelRecord) {
    return json(req, { error: "Forbidden: Target workspace has no connected Discord channel" }, 403);
  }

  // 3. IDEMPOTENCY CHECK
  const idempotencyKey = `inbound:discord:${message_id}`;
  const { data: existingLog } = await supabaseAdmin
    .from("integration_event_logs")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingLog) {
    return json(req, { success: true, duplicate: true, message: "Event already processed" });
  }

  // 4. MAP INTO UNIFIED INBOX (conversation_threads & inbox_messages)
  const threadQuery = await supabaseAdmin
    .from("conversation_threads")
    .select("id")
    .eq("workspace_id", workspace_id)
    .eq("channel_type", "discord")
    .eq("external_thread_id", channel_id)
    .maybeSingle();

  let threadId = threadQuery.data?.id;

  if (!threadId) {
    const { data: newThread, error: threadErr } = await supabaseAdmin
      .from("conversation_threads")
      .insert({
        workspace_id: workspace_id,
        channel_type: "discord",
        external_thread_id: channel_id,
        title: `Discord Channel ${channel_id}`,
        status: "open",
        metadata: { guild_id: body.guild_id, last_message_at: body.timestamp ?? new Date().toISOString() },
      })
      .select("id")
      .single();

    if (threadErr) {
      return json(req, { error: `Failed to create thread: ${threadErr.message}` }, 500);
    }
    threadId = newThread.id;
  }

  // Insert message record into inbox_messages
  const { data: newMessage, error: msgErr } = await supabaseAdmin
    .from("inbox_messages")
    .insert({
      thread_id: threadId,
      sender_id: author.id,
      sender_type: author.bot ? "bot" : "customer",
      content,
      metadata: {
        message_id,
        author_username: author.username,
        reply_to_message_id: body.reply_to_message_id,
      },
    })
    .select("id")
    .single();

  if (msgErr) {
    return json(req, { error: `Failed to insert inbox message: ${msgErr.message}` }, 500);
  }

  // 5. WRITE INTEGRATION EVENT LOG
  await supabaseAdmin.from("integration_event_logs").insert({
    workspace_id: workspace_id,
    adapter_key: "discord",
    event_type: "inbound_message",
    idempotency_key: idempotencyKey,
    status: "success",
    metadata: {
      message_id,
      channel_id,
      guild_id: body.guild_id,
      inbox_message_id: newMessage.id,
    },
  });

  return json(req, {
    success: true,
    thread_id: threadId,
    inbox_message_id: newMessage.id,
    idempotency_key: idempotencyKey,
  });
});
