import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 200;
const RATE_WINDOW = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  // GET — Meta webhook verification
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && token === verifyToken) {
      console.log("[WHATSAPP] Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "whatsapp";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json();
    const entries = body?.entry || [];
    let processed = 0;
    let statusUpdates = 0;

    for (const entry of entries) {
      for (const change of (entry?.changes || [])) {
        const value = change?.value;
        if (!value || change.field !== "messages") continue;

        const phoneNumberId = value.metadata?.phone_number_id;

        // ── Find matched channel ──
        const { data: channels } = await supabase
          .from("channels")
          .select("id, user_id, workspace_id, settings")
          .eq("channel_type", "whatsapp")
          .eq("is_enabled", true)
          .limit(100);

        const matchedChannel = (channels || []).find((ch: any) => {
          const s = ch.settings as Record<string, any> | null;
          return s?.phone_number_id === phoneNumberId;
        });

        if (!matchedChannel) {
          console.warn(`[WHATSAPP] No channel for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        const userId = matchedChannel.user_id;
        const workspaceId = matchedChannel.workspace_id;

        // ── Process delivery status updates ──
        const statuses = value.statuses || [];
        for (const s of statuses) {
          const deliveryStatus = s.status === "read" ? "read"
            : s.status === "delivered" ? "delivered"
            : s.status === "sent" ? "sent"
            : s.status === "failed" ? "failed" : s.status;

          await supabase.from("message_delivery_states").insert({
            user_id: userId,
            workspace_id: workspaceId,
            channel_type: "whatsapp",
            direction: "outbound",
            provider_message_id: s.id,
            delivery_status: deliveryStatus,
            failure_reason: s.errors?.[0]?.title || null,
            failure_code: s.errors?.[0]?.code?.toString() || null,
            status_updated_at: s.timestamp ? new Date(parseInt(s.timestamp) * 1000).toISOString() : new Date().toISOString(),
            provider_timestamp: s.timestamp ? new Date(parseInt(s.timestamp) * 1000).toISOString() : null,
            metadata: { raw: s },
          } as any);

          // Update inbox message delivery_status if found
          if (s.id) {
            await supabase
              .from("inbox_messages")
              .update({ delivery_status: deliveryStatus, updated_at: new Date().toISOString() } as any)
              .eq("provider_message_id", s.id);
          }

          // Bounce detection → suppression
          if (deliveryStatus === "failed" && s.errors?.[0]) {
            const errCode = s.errors[0].code;
            // 470 = re-engagement required, 131047 = re-engagement, 131026 = not on WA
            if ([470, 131047, 131026].includes(errCode) && s.recipient_id) {
              await supabase.from("global_suppression_list").upsert({
                user_id: userId,
                workspace_id: workspaceId,
                contact_identifier: s.recipient_id,
                channel_type: "whatsapp",
                suppression_type: "bounce",
                reason: s.errors[0].title || `WA error ${errCode}`,
                source: "webhook",
              }, { onConflict: "user_id,contact_identifier,channel_type,suppression_type" });
            }
          }

          statusUpdates++;
        }

        // ── Process incoming messages ──
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const msg of messages) {
          try {
            const contact = contacts.find((c: any) => c.wa_id === msg.from);
            const senderName = contact?.profile?.name || msg.from;
            const senderIdentifier = msg.from;
            const providerMessageId = msg.id;

            // ── Extract content + media ──
            let messageContent = "";
            const mediaAttachments: any[] = [];

            if (msg.type === "text") {
              messageContent = msg.text?.body || "";
            } else if (msg.type === "image") {
              messageContent = msg.image?.caption || "[Image]";
              mediaAttachments.push({
                type: "image",
                provider_media_id: msg.image?.id,
                mime_type: msg.image?.mime_type,
                caption: msg.image?.caption,
                sha256: msg.image?.sha256,
              });
            } else if (msg.type === "video") {
              messageContent = msg.video?.caption || "[Video]";
              mediaAttachments.push({
                type: "video",
                provider_media_id: msg.video?.id,
                mime_type: msg.video?.mime_type,
                caption: msg.video?.caption,
              });
            } else if (msg.type === "audio") {
              messageContent = "[Audio]";
              mediaAttachments.push({
                type: "audio",
                provider_media_id: msg.audio?.id,
                mime_type: msg.audio?.mime_type,
              });
            } else if (msg.type === "document") {
              messageContent = `[Document] ${msg.document?.filename || ""}`.trim();
              mediaAttachments.push({
                type: "document",
                provider_media_id: msg.document?.id,
                mime_type: msg.document?.mime_type,
                file_name: msg.document?.filename,
                caption: msg.document?.caption,
              });
            } else if (msg.type === "sticker") {
              messageContent = "[Sticker]";
              mediaAttachments.push({ type: "sticker", provider_media_id: msg.sticker?.id });
            } else if (msg.type === "location") {
              messageContent = `[Location] ${msg.location?.latitude},${msg.location?.longitude}`;
              mediaAttachments.push({
                type: "location",
                metadata: { lat: msg.location?.latitude, lng: msg.location?.longitude, name: msg.location?.name },
              });
            } else {
              messageContent = `[${msg.type || "unknown"}]`;
            }

            if (!messageContent) continue;

            const timestamp = msg.timestamp
              ? new Date(parseInt(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString();

            // ── Conversation threading ──
            const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
              _user_id: userId,
              _channel_type: "whatsapp",
              _contact_identifier: senderIdentifier,
              _contact_name: senderName,
              _message_preview: messageContent,
              _direction: "inbound",
            });

            // ── Keyword matching ──
            const { data: keywords } = await supabase
              .from("keywords")
              .select("keyword")
              .eq("user_id", userId)
              .eq("is_active", true);

            const textLower = messageContent.toLowerCase();
            const matched = (keywords || [])
              .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
              .map((k: any) => k.keyword);
            const intentScore = matched.length > 0 ? 0.5 : 0.1;

            // ── Context from replied message ──
            const contextMsgId = msg.context?.id || null;

            // ── Insert inbox message ──
            const { data: inboxMsg, error: inboxErr } = await supabase.from("inbox_messages").insert({
              user_id: userId,
              workspace_id: workspaceId,
              channel_id: matchedChannel.id,
              channel_type: "whatsapp",
              source_name: "WhatsApp",
              sender_name: senderName,
              sender_identifier: senderIdentifier,
              message_content: messageContent,
              message_timestamp: timestamp,
              intent_score: intentScore,
              matched_keywords: matched,
              is_unread: true,
              priority: matched.length > 0 ? "medium" : "normal",
              status: "new",
              direction: "inbound",
              delivery_status: "delivered",
              provider_message_id: providerMessageId,
              media_attachments: mediaAttachments.length > 0 ? mediaAttachments : [],
              thread_id: threadId || null,
              metadata: {
                wa_message_type: msg.type,
                context_message_id: contextMsgId,
              },
            } as any).select("id").single();

            if (inboxErr) { console.error("[WHATSAPP] Inbox error:", inboxErr); continue; }

            // ── Store media records ──
            for (const media of mediaAttachments) {
              await supabase.from("message_media").insert({
                user_id: userId,
                workspace_id: workspaceId,
                inbox_message_id: inboxMsg?.id,
                media_type: media.type,
                mime_type: media.mime_type || null,
                file_name: media.file_name || null,
                provider_media_id: media.provider_media_id || null,
                caption: media.caption || null,
                metadata: media.metadata || {},
              } as any);
            }

            // ── Delivery state ──
            await supabase.from("message_delivery_states").insert({
              user_id: userId,
              workspace_id: workspaceId,
              inbox_message_id: inboxMsg?.id,
              channel_type: "whatsapp",
              direction: "inbound",
              provider_message_id: providerMessageId,
              delivery_status: "delivered",
              provider_timestamp: timestamp,
            } as any);

            // ── Lead creation ──
            if (matched.length > 0 && intentScore >= 0.3) {
              await supabase.from("leads").insert({
                user_id: userId,
                workspace_id: workspaceId,
                message_content: messageContent,
                source_name: senderName,
                source_type: "whatsapp",
                message_date: timestamp,
                detected_keyword: matched[0],
                intent_score: intentScore,
                status: "new",
              });
            }

            processed++;
          } catch (msgErr) {
            console.error("[WHATSAPP] Message error:", msgErr);
          }
        }
      }
    }

    console.log(`[WHATSAPP] Messages: ${processed}, Status updates: ${statusUpdates}`);
    return new Response(
      JSON.stringify({ ok: true, processed, statusUpdates }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[WHATSAPP] Fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
