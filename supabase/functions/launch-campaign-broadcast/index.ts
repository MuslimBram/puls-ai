import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

/**
 * Campaign → Broadcast Launcher
 *
 * Converts a campaign in `strategy_ready` state into one or more broadcasts.
 * - Picks the first content piece per channel as the broadcast message
 * - Materializes recipients from a segment (if provided) OR from conversation_threads
 *   matching the campaign's preferred channels
 * - Inserts broadcast row, broadcast_recipients rows, and broadcast_send_queue rows
 * - Updates campaign status -> 'launched'
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { campaign_id, segment_id, channel_override, scheduled_at } = body;

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1. Load campaign
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // 2. Load campaign content (pick top-of-funnel pieces per channel)
    const { data: contents } = await supabase
      .from("campaign_content")
      .select("*")
      .eq("campaign_id", campaign_id)
      .order("sort_order", { ascending: true });

    if (!contents || contents.length === 0) {
      return new Response(JSON.stringify({ error: "Campaign has no content. Generate strategy first." }), {
        status: 400,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // 3. Determine channels to launch
    const channels: string[] = channel_override
      ? [channel_override]
      : (campaign.preferred_channels || ["email"]);

    // 4. Build recipient list
    let recipients: Array<{ identifier: string; name: string | null; channel: string }> = [];

    if (segment_id) {
      // Resolve from segment - segments don't store contacts directly,
      // so we re-query threads matching the segment criteria
      const { data: segment } = await supabase
        .from("contact_segments")
        .select("filter_criteria")
        .eq("id", segment_id)
        .eq("user_id", userId)
        .maybeSingle();
      const criteria = (segment?.filter_criteria as any) || {};
      const segChannels = criteria.channels || channels;

      const { data: threads } = await supabase
        .from("conversation_threads")
        .select("channel_type, contact_identifier, contact_name")
        .eq("user_id", userId)
        .in("channel_type", segChannels)
        .not("contact_identifier", "is", null);

      recipients = (threads || []).map((t: any) => ({
        identifier: t.contact_identifier,
        name: t.contact_name,
        channel: t.channel_type,
      }));
    } else {
      // Fallback: all unique conversation contacts on the campaign's channels
      const { data: threads } = await supabase
        .from("conversation_threads")
        .select("channel_type, contact_identifier, contact_name")
        .eq("user_id", userId)
        .in("channel_type", channels)
        .not("contact_identifier", "is", null);

      recipients = (threads || []).map((t: any) => ({
        identifier: t.contact_identifier,
        name: t.contact_name,
        channel: t.channel_type,
      }));
    }

    // Dedupe per (channel, identifier)
    const seen = new Set<string>();
    recipients = recipients.filter((r) => {
      const key = `${r.channel}:${r.identifier}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const broadcasts_created: any[] = [];

    // 5. Create one broadcast per channel
    for (const channel of channels) {
      const channelRecipients = recipients.filter((r) => r.channel === channel);
      if (channelRecipients.length === 0) continue;

      // Pick first content piece for this channel (or fallback to first overall)
      const content =
        contents.find((c: any) => c.content_type?.toLowerCase().includes(channel)) ||
        contents[0];

      const messageBody = content.body || `Check out our ${campaign.name} campaign!`;
      const subject = content.title || campaign.name;

      // Insert broadcast
      const { data: broadcast, error: bErr } = await supabase
        .from("broadcasts")
        .insert({
          user_id: userId,
          workspace_id: campaign.workspace_id,
          campaign_id: campaign.id,
          segment_id: segment_id || null,
          name: `${campaign.name} - ${channel}`,
          channel_type: channel,
          subject,
          message_content: messageBody,
          status: scheduled_at ? "scheduled" : "queued",
          scheduled_at: scheduled_at || null,
          total_recipients: channelRecipients.length,
          template_data: {
            campaign_objective: campaign.objective,
            funnel_stage: content.funnel_stage,
            hashtags: content.hashtags || [],
          },
        })
        .select()
        .single();

      if (bErr || !broadcast) {
        console.error("Broadcast insert failed", bErr);
        continue;
      }

      // Insert recipients in batches
      const recipientRows = channelRecipients.map((r) => ({
        broadcast_id: broadcast.id,
        user_id: userId,
        contact_identifier: r.identifier,
        contact_name: r.name,
        status: "pending",
      }));

      const { data: insertedRecipients, error: rErr } = await supabase
        .from("broadcast_recipients")
        .insert(recipientRows)
        .select("id, contact_identifier");

      if (rErr) {
        console.error("Recipient insert failed", rErr);
        continue;
      }

      // Insert send queue rows
      const queueRows = (insertedRecipients || []).map((rec: any) => ({
        broadcast_id: broadcast.id,
        recipient_id: rec.id,
        user_id: userId,
        channel_type: channel,
        contact_identifier: rec.contact_identifier,
        status: "pending",
        attempt_count: 0,
        max_attempts: 3,
      }));

      if (queueRows.length > 0) {
        const { error: qErr } = await supabase
          .from("broadcast_send_queue")
          .insert(queueRows);
        if (qErr) console.error("Queue insert failed", qErr);
      }

      broadcasts_created.push({
        id: broadcast.id,
        channel,
        recipients: channelRecipients.length,
      });
    }

    // 6. Update campaign status
    await supabase
      .from("campaigns")
      .update({ status: "launched", updated_at: new Date().toISOString() })
      .eq("id", campaign_id);

    return new Response(
      JSON.stringify({
        ok: true,
        campaign_id,
        broadcasts_created,
        total_recipients: recipients.length,
      }),
      { headers: { ...getCors(req), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("launch-campaign-broadcast error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
