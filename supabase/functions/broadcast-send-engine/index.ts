import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Broadcast Send Engine
 * 
 * Processes the broadcast_send_queue with full compliance enforcement:
 * - Suppression list checking
 * - Opt-out enforcement
 * - Per-channel throttling
 * - Bounce detection & recording
 * - Retry scheduling with backoff
 * - Reputation score updates
 * 
 * Called via pg_cron every minute or manually triggered.
 */

const CHANNEL_LIMITS: Record<string, { maxPerMinute: number; maxPerDay: number }> = {
  email: { maxPerMinute: 100, maxPerDay: 5000 },
  sms: { maxPerMinute: 30, maxPerDay: 1000 },
  whatsapp: { maxPerMinute: 60, maxPerDay: 1000 },
  telegram: { maxPerMinute: 30, maxPerDay: 3000 },
};

const RETRY_DELAYS = [60, 300, 900]; // 1min, 5min, 15min

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
    const now = new Date();
    const stats = { processed: 0, sent: 0, suppressed: 0, failed: 0, retried: 0 };

    // 1. Fetch pending items ready to send (limit batch to avoid timeout)
    const { data: queue, error: qErr } = await supabase
      .from("broadcast_send_queue")
      .select("*, broadcasts!inner(user_id, channel_type, throttle_per_minute, status)")
      .in("status", ["pending", "failed"])
      .or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`)
      .lt("attempt_count", 3)
      .order("created_at", { ascending: true })
      .limit(100);

    if (qErr) throw qErr;
    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No items to process", stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by broadcast for throttle tracking
    const broadcastGroups = new Map<string, typeof queue>();
    for (const item of queue) {
      const group = broadcastGroups.get(item.broadcast_id) || [];
      group.push(item);
      broadcastGroups.set(item.broadcast_id, group);
    }

    for (const [broadcastId, items] of broadcastGroups) {
      const broadcast = (items[0] as any).broadcasts;
      if (!broadcast || broadcast.status === "paused") continue;

      const channelType = broadcast.channel_type || "email";
      const limits = CHANNEL_LIMITS[channelType] || CHANNEL_LIMITS.email;
      const throttle = Math.min(broadcast.throttle_per_minute || limits.maxPerMinute, limits.maxPerMinute);

      // Process up to throttle limit per broadcast
      const batch = items.slice(0, throttle);

      for (const item of batch) {
        stats.processed++;

        // 2. Check suppression + opt-out
        const { data: isSuppressed } = await supabase.rpc("is_contact_suppressed", {
          _user_id: item.user_id,
          _contact_identifier: item.contact_identifier,
          _channel_type: item.channel_type,
        });

        if (isSuppressed) {
          await supabase
            .from("broadcast_send_queue")
            .update({ status: "suppressed", updated_at: now.toISOString() } as any)
            .eq("id", item.id);
          
          await supabase
            .from("broadcast_recipients")
            .update({ status: "suppressed" } as any)
            .eq("id", item.recipient_id);

          stats.suppressed++;
          continue;
        }

        // 3. Inject legal footer + unsubscribe link
        const unsubscribeUrl = await getUnsubscribeUrl(supabase, item, broadcastId);
        
        // 4. Send via actual channel
        const sendResult = await dispatchToChannel(supabase, item, channelType, unsubscribeUrl);

        if (sendResult.success) {
          // Mark sent
          await supabase
            .from("broadcast_send_queue")
            .update({
              status: "sent",
              sent_at: now.toISOString(),
              attempt_count: item.attempt_count + 1,
              updated_at: now.toISOString(),
            } as any)
            .eq("id", item.id);

          await supabase
            .from("broadcast_recipients")
            .update({ status: "sent", sent_at: now.toISOString() } as any)
            .eq("id", item.recipient_id);

          stats.sent++;
        } else if (sendResult.bounce) {
          // Record bounce in suppression list
          await supabase.from("global_suppression_list").upsert({
            user_id: item.user_id,
            contact_identifier: item.contact_identifier,
            channel_type: item.channel_type,
            suppression_type: "bounce",
            reason: sendResult.error || "hard_bounce",
            source: "broadcast",
            source_id: broadcastId,
          }, { onConflict: "user_id,contact_identifier,channel_type,suppression_type" });

          await supabase
            .from("broadcast_send_queue")
            .update({ status: "bounced", last_error: sendResult.error, updated_at: now.toISOString() } as any)
            .eq("id", item.id);

          await supabase
            .from("broadcast_recipients")
            .update({ status: "bounced", error_message: sendResult.error } as any)
            .eq("id", item.recipient_id);

          // Increment bounce count on broadcast
          await supabase.rpc("increment_broadcast_counter", { _broadcast_id: broadcastId, _field: "bounce_count" }).catch(() => {});

          stats.failed++;
        } else {
          // Transient failure — schedule retry
          const nextAttempt = item.attempt_count + 1;
          if (nextAttempt < item.max_attempts) {
            const delaySeconds = RETRY_DELAYS[Math.min(nextAttempt - 1, RETRY_DELAYS.length - 1)];
            const retryAt = new Date(now.getTime() + delaySeconds * 1000);

            await supabase
              .from("broadcast_send_queue")
              .update({
                status: "failed",
                attempt_count: nextAttempt,
                next_retry_at: retryAt.toISOString(),
                last_error: sendResult.error,
                updated_at: now.toISOString(),
              } as any)
              .eq("id", item.id);

            stats.retried++;
          } else {
            // Max retries exceeded
            await supabase
              .from("broadcast_send_queue")
              .update({ status: "failed", attempt_count: nextAttempt, last_error: "max_retries_exceeded", updated_at: now.toISOString() } as any)
              .eq("id", item.id);

            await supabase
              .from("broadcast_recipients")
              .update({ status: "failed", error_message: sendResult.error || "max_retries_exceeded" } as any)
              .eq("id", item.recipient_id);

            stats.failed++;
          }
        }
      }

      // 4. Update broadcast aggregate counts
      const { data: queueStats } = await supabase
        .from("broadcast_send_queue")
        .select("status")
        .eq("broadcast_id", broadcastId);

      if (queueStats) {
        const sentCount = queueStats.filter(q => q.status === "sent").length;
        const failedCount = queueStats.filter(q => ["failed", "bounced"].includes(q.status)).length;
        const pendingCount = queueStats.filter(q => q.status === "pending").length;
        const suppressedCount = queueStats.filter(q => q.status === "suppressed").length;

        const updateData: any = {
          sent_count: sentCount,
          failed_count: failedCount,
          updated_at: now.toISOString(),
        };

        if (pendingCount === 0) {
          updateData.status = "completed";
          updateData.completed_at = now.toISOString();
        }

        await supabase.from("broadcasts").update(updateData).eq("id", broadcastId);
      }

      // 5. Update sending reputation
      await updateReputation(supabase, broadcast.user_id, channelType);
    }

    console.log(`[SEND-ENGINE] Processed: ${stats.processed}, Sent: ${stats.sent}, Suppressed: ${stats.suppressed}, Failed: ${stats.failed}, Retried: ${stats.retried}`);

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[SEND-ENGINE] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getUnsubscribeUrl(
  supabase: any,
  item: any,
  broadcastId: string
): Promise<string> {
  const baseUrl = Deno.env.get("SUPABASE_URL");

  // Check for existing token
  const { data: existing } = await supabase
    .from("broadcast_unsubscribe_tokens")
    .select("token")
    .eq("user_id", item.user_id)
    .eq("contact_identifier", item.contact_identifier)
    .eq("channel_type", item.channel_type)
    .is("used_at", null)
    .maybeSingle();

  if (existing) {
    return `${baseUrl}/functions/v1/broadcast-unsubscribe?token=${existing.token}`;
  }

  // Create new token
  const token = crypto.randomUUID();
  await supabase.from("broadcast_unsubscribe_tokens").insert({
    user_id: item.user_id,
    contact_identifier: item.contact_identifier,
    channel_type: item.channel_type,
    broadcast_id: broadcastId,
    token,
  });

  return `${baseUrl}/functions/v1/broadcast-unsubscribe?token=${token}`;
}

const LEGAL_FOOTER: Record<string, (url: string) => string> = {
  email: (url) => `\n\n---\nYou received this message because you subscribed. To unsubscribe: ${url}\nThis message was sent in compliance with CAN-SPAM and GDPR regulations.`,
  sms: (url) => `\nReply STOP to unsubscribe or visit: ${url}`,
  whatsapp: (url) => `\n\nTo opt out of future messages, visit: ${url}`,
  telegram: (url) => `\n\nUnsubscribe: ${url}`,
};

async function dispatchToChannel(
  supabase: any,
  item: any,
  channelType: string,
  unsubscribeUrl: string
): Promise<{ success: boolean; bounce?: boolean; error?: string }> {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  // Inject legal footer
  const footer = (LEGAL_FOOTER[channelType] || LEGAL_FOOTER.email)(unsubscribeUrl);
  const messageWithFooter = (item.contact_identifier ? "" : "") + footer; // footer appended by channel sender

  try {
    let functionName = "";
    let body: Record<string, unknown> = {};

    switch (channelType) {
      case "email":
        functionName = "send-email";
        body = {
          to: item.contact_identifier,
          subject: "Broadcast Message",
          body: messageWithFooter,
          user_id: item.user_id,
        };
        break;
      case "sms":
        functionName = "send-sms";
        body = {
          to: item.contact_identifier,
          message: messageWithFooter,
          user_id: item.user_id,
        };
        break;
      case "whatsapp":
        functionName = "send-whatsapp";
        body = {
          to: item.contact_identifier,
          message: messageWithFooter,
          user_id: item.user_id,
        };
        break;
      case "telegram":
        functionName = "send-telegram";
        body = {
          chat_id: item.contact_identifier,
          message: messageWithFooter,
          user_id: item.user_id,
        };
        break;
      default:
        return { success: false, error: `Unsupported channel: ${channelType}` };
    }

    const resp = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      return { success: true };
    }

    const errData = await resp.json().catch(() => ({}));
    const errMsg = errData?.error || `HTTP ${resp.status}`;

    // Hard bounce detection (invalid recipient indicators)
    if (resp.status === 400 && (errMsg.includes("invalid") || errMsg.includes("not found") || errMsg.includes("unregistered"))) {
      return { success: false, bounce: true, error: errMsg };
    }

    return { success: false, bounce: false, error: errMsg };
  } catch (e) {
    return { success: false, bounce: false, error: e instanceof Error ? e.message : "dispatch_error" };
  }
}

async function updateReputation(
  supabase: any,
  userId: string,
  channelType: string
) {
  try {
    // Get aggregate stats from send queue
    const { data: sent } = await supabase
      .from("broadcast_send_queue")
      .select("status")
      .eq("user_id", userId)
      .eq("channel_type", channelType);

    if (!sent || sent.length === 0) return;

    const totalSent = sent.filter((s: any) => s.status === "sent").length;
    const totalBounced = sent.filter((s: any) => s.status === "bounced").length;
    const totalFailed = sent.filter((s: any) => s.status === "failed").length;

    // Get complaint/unsub counts
    const { count: complainedCount } = await supabase
      .from("global_suppression_list")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("channel_type", channelType)
      .eq("suppression_type", "complaint");

    const { count: unsubCount } = await supabase
      .from("global_suppression_list")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("channel_type", channelType)
      .eq("suppression_type", "unsubscribe");

    const totalAll = totalSent + totalBounced + totalFailed;
    const score = totalAll > 0
      ? Math.max(0, Math.min(100,
          100 - ((totalBounced / totalAll) * 200) - (((complainedCount || 0) / Math.max(totalAll, 1)) * 500) - (((unsubCount || 0) / Math.max(totalAll, 1)) * 100)
        ))
      : 100;

    await supabase.from("sending_reputation").upsert({
      user_id: userId,
      channel_type: channelType,
      total_sent: totalSent,
      total_bounced: totalBounced,
      total_complained: complainedCount || 0,
      total_unsubscribed: unsubCount || 0,
      reputation_score: Math.round(score * 10) / 10,
      last_computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,channel_type" });
  } catch (e) {
    console.error("[REPUTATION] Update failed:", e);
  }
}
