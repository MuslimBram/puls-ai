import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, workspace_id } = await req.json();
    if (!user_id) throw new Error("user_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const sb = createClient(supabaseUrl, serviceKey);

    // Gather data for analysis
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Leads this week vs last week
    const { count: leadsThisWeek } = await sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id)
      .gte("message_date", weekAgo.toISOString());

    const { count: leadsLastWeek } = await sb
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id)
      .gte("message_date", twoWeeksAgo.toISOString())
      .lt("message_date", weekAgo.toISOString());

    // Active channels
    const { data: channels } = await sb
      .from("channels")
      .select("channel_name, is_enabled, connection_status")
      .eq("user_id", user_id);

    const activeChannels = (channels || []).filter((c: any) => c.is_enabled && c.connection_status === "connected");
    const inactiveChannels = (channels || []).filter((c: any) => !c.is_enabled || c.connection_status !== "connected");

    // Inbox response times
    const { data: inboxMsgs } = await sb
      .from("inbox_messages")
      .select("created_at, first_response_at")
      .eq("user_id", user_id)
      .gte("created_at", weekAgo.toISOString())
      .not("first_response_at", "is", null)
      .limit(100);

    const responseTimes = (inboxMsgs || []).map((m: any) =>
      (new Date(m.first_response_at).getTime() - new Date(m.created_at).getTime()) / 60000
    );
    const avgResponseMin = responseTimes.length
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : null;

    // Previous week response time
    const { data: prevInbox } = await sb
      .from("inbox_messages")
      .select("created_at, first_response_at")
      .eq("user_id", user_id)
      .gte("created_at", twoWeeksAgo.toISOString())
      .lt("created_at", weekAgo.toISOString())
      .not("first_response_at", "is", null)
      .limit(100);

    const prevResponseTimes = (prevInbox || []).map((m: any) =>
      (new Date(m.first_response_at).getTime() - new Date(m.created_at).getTime()) / 60000
    );
    const prevAvgResponseMin = prevResponseTimes.length
      ? Math.round(prevResponseTimes.reduce((a: number, b: number) => a + b, 0) / prevResponseTimes.length)
      : null;

    // Campaigns
    const { data: broadcasts } = await sb
      .from("broadcasts")
      .select("name, sent_count, delivered_count, opened_count, status")
      .eq("user_id", user_id)
      .gte("created_at", weekAgo.toISOString());

    // Automation errors
    const { count: autoErrors } = await sb
      .from("automation_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("status", "error")
      .gte("created_at", weekAgo.toISOString());

    const { count: autoTotal } = await sb
      .from("automation_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id)
      .gte("created_at", weekAgo.toISOString());

    // Leads by source (check for inactive sources)
    const { data: recentLeadsBySource } = await sb
      .from("leads")
      .select("source_name")
      .eq("user_id", user_id)
      .gte("message_date", threeDaysAgo.toISOString());

    const { data: allLeadSources } = await sb
      .from("leads")
      .select("source_name")
      .eq("user_id", user_id)
      .gte("message_date", twoWeeksAgo.toISOString())
      .lt("message_date", threeDaysAgo.toISOString());

    const recentSourceSet = new Set((recentLeadsBySource || []).map((l: any) => l.source_name));
    const historicalSources = [...new Set((allLeadSources || []).map((l: any) => l.source_name))];
    const silentSources = historicalSources.filter(s => !recentSourceSet.has(s));

    // Competitor activity
    const { count: competitorAlerts } = await sb
      .from("competitor_alerts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("is_read", false)
      .gte("created_at", weekAgo.toISOString());

    // Calculate health scores
    const lw = leadsThisWeek || 0;
    const ll = leadsLastWeek || 0;
    const leadVolumeScore = ll > 0
      ? Math.min(100, Math.max(10, 50 + Math.round(((lw - ll) / ll) * 50)))
      : lw > 0 ? 70 : 20;

    const channelActivityScore = channels && channels.length > 0
      ? Math.round((activeChannels.length / channels.length) * 100)
      : 20;

    const responseSpeedScore = avgResponseMin !== null
      ? avgResponseMin <= 5 ? 95 : avgResponseMin <= 15 ? 80 : avgResponseMin <= 60 ? 60 : avgResponseMin <= 240 ? 40 : 20
      : 50;

    const campaignEngagementScore = broadcasts && broadcasts.length > 0
      ? Math.min(100, 50 + broadcasts.length * 10)
      : 20;

    const autoSuccessRate = (autoTotal || 0) > 0
      ? Math.round((1 - (autoErrors || 0) / (autoTotal || 1)) * 100)
      : 50;

    const overallScore = Math.round(
      (leadVolumeScore * 0.25) +
      (channelActivityScore * 0.2) +
      (responseSpeedScore * 0.25) +
      (campaignEngagementScore * 0.15) +
      (autoSuccessRate * 0.15)
    );

    // Generate notifications
    const notifications: Array<{type: string; category: string; title: string; message: string; action_url?: string}> = [];

    if (lw === 0 && ll > 0) {
      notifications.push({ type: "warning", category: "leads", title: "No new leads this week", message: "You haven't received any new leads in the past 7 days. Consider checking your keyword setup or running a campaign.", action_url: "/leads" });
    } else if (ll > 0 && lw < ll * 0.5) {
      notifications.push({ type: "warning", category: "leads", title: "Lead volume dropped significantly", message: `Leads dropped from ${ll} to ${lw} compared to last week (${Math.round(((lw - ll) / ll) * 100)}%).`, action_url: "/analytics" });
    }

    silentSources.forEach(source => {
      notifications.push({ type: "info", category: "leads", title: `No leads from ${source} for 3+ days`, message: `You haven't received new leads from ${source} for at least 3 days. Check if the source is still active.`, action_url: "/sources" });
    });

    inactiveChannels.forEach((ch: any) => {
      notifications.push({ type: "info", category: "channels", title: `Channel "${ch.channel_name}" is inactive`, message: "This channel is disconnected or disabled. Reconnect to resume receiving messages.", action_url: "/channels" });
    });

    if (avgResponseMin !== null && prevAvgResponseMin !== null && avgResponseMin > prevAvgResponseMin * 1.3) {
      notifications.push({ type: "warning", category: "response", title: "Response time is slower", message: `Average response time increased from ${prevAvgResponseMin}min to ${avgResponseMin}min compared to last week.`, action_url: "/helpdesk" });
    }

    if ((autoErrors || 0) > 0) {
      notifications.push({ type: "critical", category: "automations", title: `${autoErrors} automation errors this week`, message: "Some automation workflows encountered errors. Review and fix them to ensure smooth operations.", action_url: "/automations" });
    }

    if ((competitorAlerts || 0) > 3) {
      notifications.push({ type: "recommendation", category: "competitors", title: "Increased competitor activity", message: `${competitorAlerts} unread competitor alerts detected. Review competitor changes for opportunities.`, action_url: "/competitor-intelligence" });
    }

    if (!broadcasts || broadcasts.length === 0) {
      notifications.push({ type: "recommendation", category: "campaigns", title: "Consider a broadcast campaign", message: "You haven't sent any campaigns this week. Engage your audience with a broadcast.", action_url: "/broadcast" });
    }

    // Generate AI suggestions if API key available
    let aiSuggestions: string[] = [];
    if (lovableKey) {
      try {
        const prompt = `You are a business analytics AI. Based on these metrics for a business communication platform, provide 3-5 brief actionable suggestions (max 1 sentence each):
- Leads this week: ${lw}, last week: ${ll}
- Active channels: ${activeChannels.length}/${(channels || []).length}
- Avg response time: ${avgResponseMin ?? "N/A"} minutes
- Silent lead sources (3+ days): ${silentSources.join(", ") || "none"}
- Automation errors: ${autoErrors || 0}/${autoTotal || 0}
- Campaigns sent: ${(broadcasts || []).length}
- Health score: ${overallScore}/100
Return only a JSON array of strings.`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          try {
            const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            aiSuggestions = JSON.parse(cleaned);
          } catch {
            aiSuggestions = content.split("\n").filter((s: string) => s.trim().length > 10).slice(0, 5);
          }
        }
      } catch (e) {
        console.error("AI suggestion error:", e);
      }
    }

    // Save health score
    await sb.from("health_scores").insert({
      user_id,
      workspace_id: workspace_id || null,
      overall_score: overallScore,
      lead_volume_score: leadVolumeScore,
      channel_activity_score: channelActivityScore,
      response_speed_score: responseSpeedScore,
      campaign_engagement_score: campaignEngagementScore,
      automation_usage_score: autoSuccessRate,
      breakdown: {
        leads_this_week: lw,
        leads_last_week: ll,
        active_channels: activeChannels.length,
        total_channels: (channels || []).length,
        avg_response_min: avgResponseMin,
        auto_errors: autoErrors || 0,
        auto_total: autoTotal || 0,
        campaigns_sent: (broadcasts || []).length,
      },
      suggestions: aiSuggestions,
    } as any);

    // Save notifications (deduplicate by title within last 24h)
    for (const notif of notifications) {
      const { count: existing } = await sb
        .from("business_notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("title", notif.title)
        .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

      if (!existing || existing === 0) {
        await sb.from("business_notifications").insert({
          user_id,
          workspace_id: workspace_id || null,
          notification_type: notif.type,
          category: notif.category,
          title: notif.title,
          message: notif.message,
          action_url: notif.action_url,
        } as any);
      }
    }

    return new Response(JSON.stringify({
      health_score: overallScore,
      scores: {
        lead_volume: leadVolumeScore,
        channel_activity: channelActivityScore,
        response_speed: responseSpeedScore,
        campaign_engagement: campaignEngagementScore,
        automation: autoSuccessRate,
      },
      notifications_generated: notifications.length,
      suggestions: aiSuggestions,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("business-insight-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
