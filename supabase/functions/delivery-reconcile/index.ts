import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Webhook Reconciliation — Delivery Status Updates
 * 
 * Handles status callbacks from providers:
 * - Twilio: MessageStatus webhooks (queued→sent→delivered→read/failed)
 * - WhatsApp: statuses[] in webhook payload
 * - Generic: JSON with { provider, message_id, status, ... }
 * 
 * Updates message_delivery_states + inbox_messages.delivery_status
 * Detects bounces and adds to global_suppression_list
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") || "auto";
    const contentType = req.headers.get("content-type") || "";
    let updates: StatusUpdate[] = [];

    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Twilio status callback format
      const formData = await req.text();
      const params = new URLSearchParams(formData);
      updates.push({
        provider: "twilio",
        provider_message_id: params.get("MessageSid") || params.get("SmsSid") || "",
        status: mapTwilioStatus(params.get("MessageStatus") || ""),
        error_code: params.get("ErrorCode") || undefined,
        error_message: params.get("ErrorMessage") || undefined,
        to: params.get("To") || "",
        channel_type: "sms",
        timestamp: new Date().toISOString(),
      });
    } else {
      const body = await req.json();

      // WhatsApp Cloud API statuses
      if (body?.entry) {
        for (const entry of body.entry) {
          for (const change of (entry.changes || [])) {
            const statuses = change?.value?.statuses || [];
            for (const s of statuses) {
              updates.push({
                provider: "whatsapp",
                provider_message_id: s.id,
                status: mapWhatsAppStatus(s.status),
                error_code: s.errors?.[0]?.code?.toString(),
                error_message: s.errors?.[0]?.title,
                to: s.recipient_id,
                channel_type: "whatsapp",
                timestamp: s.timestamp ? new Date(parseInt(s.timestamp) * 1000).toISOString() : new Date().toISOString(),
              });
            }
          }
        }
      }

      // Generic JSON format
      if (body?.provider_message_id && body?.status) {
        updates.push({
          provider: provider,
          provider_message_id: body.provider_message_id,
          status: body.status,
          error_code: body.error_code,
          error_message: body.error_message,
          to: body.to || body.recipient || "",
          channel_type: body.channel_type || "email",
          timestamp: body.timestamp || new Date().toISOString(),
        });
      }
    }

    let reconciled = 0;
    let bounces = 0;

    for (const update of updates) {
      if (!update.provider_message_id || !update.status) continue;

      // Find the inbox message by provider_message_id
      const { data: inboxMsg } = await supabase
        .from("inbox_messages")
        .select("id, user_id, sender_identifier, channel_type")
        .eq("provider_message_id", update.provider_message_id)
        .maybeSingle();

      // Insert delivery state record
      await supabase.from("message_delivery_states").insert({
        user_id: inboxMsg?.user_id || "00000000-0000-0000-0000-000000000000",
        inbox_message_id: inboxMsg?.id || null,
        channel_type: update.channel_type,
        direction: "outbound",
        provider_message_id: update.provider_message_id,
        delivery_status: update.status,
        failure_reason: update.error_message,
        failure_code: update.error_code,
        status_updated_at: update.timestamp,
        provider_timestamp: update.timestamp,
        metadata: { provider: update.provider, raw_status: update.status },
      } as any);

      // Update inbox message delivery_status if found
      if (inboxMsg) {
        await supabase
          .from("inbox_messages")
          .update({ delivery_status: update.status, updated_at: new Date().toISOString() } as any)
          .eq("id", inboxMsg.id);
      }

      // Handle bounces — add to suppression list
      if (["bounced", "failed", "undelivered"].includes(update.status) && inboxMsg) {
        const isBounce = update.status === "bounced" || 
          (update.error_code && ["30003", "30005", "30006", "21610", "21614"].includes(update.error_code));

        if (isBounce && update.to) {
          await supabase.from("global_suppression_list").upsert({
            user_id: inboxMsg.user_id,
            contact_identifier: update.to,
            channel_type: update.channel_type,
            suppression_type: "bounce",
            reason: update.error_message || `${update.status} (${update.error_code || "unknown"})`,
            source: "webhook_reconciliation",
            source_id: update.provider_message_id,
          }, { onConflict: "user_id,contact_identifier,channel_type,suppression_type" });
          bounces++;
        }

        // Update reputation
        const { data: rep } = await supabase
          .from("sending_reputation")
          .select("*")
          .eq("user_id", inboxMsg.user_id)
          .eq("channel_type", update.channel_type)
          .maybeSingle();

        if (rep) {
          await supabase
            .from("sending_reputation")
            .update({
              total_bounced: (rep.total_bounced || 0) + 1,
              reputation_score: Math.max(0, Number(rep.reputation_score) - 2),
              last_computed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", rep.id);
        }
      }

      // Handle delivered — update reputation positively
      if (update.status === "delivered" && inboxMsg) {
        const { data: rep } = await supabase
          .from("sending_reputation")
          .select("*")
          .eq("user_id", inboxMsg.user_id)
          .eq("channel_type", update.channel_type)
          .maybeSingle();

        if (rep) {
          await supabase
            .from("sending_reputation")
            .update({
              total_delivered: (rep.total_delivered || 0) + 1,
              last_computed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", rep.id);
        }
      }

      reconciled++;
    }

    console.log(`[RECONCILE] Processed: ${reconciled}, Bounces: ${bounces}`);

    // Return appropriate response
    if (updates.some(u => u.provider === "twilio")) {
      return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    return new Response(JSON.stringify({ ok: true, reconciled, bounces }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[RECONCILE] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface StatusUpdate {
  provider: string;
  provider_message_id: string;
  status: string;
  error_code?: string;
  error_message?: string;
  to: string;
  channel_type: string;
  timestamp: string;
}

function mapTwilioStatus(status: string): string {
  const map: Record<string, string> = {
    queued: "queued",
    sending: "queued",
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
    undelivered: "undelivered",
  };
  return map[status.toLowerCase()] || status.toLowerCase();
}

function mapWhatsAppStatus(status: string): string {
  const map: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
  };
  return map[status.toLowerCase()] || status.toLowerCase();
}
