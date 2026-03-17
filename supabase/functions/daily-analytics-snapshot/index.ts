import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all active workspaces with owners
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, owner_id, name");

    if (!workspaces?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const startOfDay = `${todayStr}T00:00:00Z`;
    const endOfDay = `${todayStr}T23:59:59Z`;
    const start30d = new Date(today.getTime() - 30 * 86400000).toISOString();

    let processed = 0;

    for (const ws of workspaces) {
      const uid = ws.owner_id;

      // Compute all metrics via DB functions
      const [agentRes, channelRes, funnelRes, aiRes, execRes] =
        await Promise.all([
          supabase.rpc("compute_agent_performance", {
            _user_id: uid,
            _start_date: start30d,
            _end_date: endOfDay,
          }),
          supabase.rpc("compute_channel_performance", {
            _user_id: uid,
            _start_date: start30d,
            _end_date: endOfDay,
          }),
          supabase.rpc("compute_funnel_analytics", {
            _user_id: uid,
            _start_date: start30d,
            _end_date: endOfDay,
          }),
          supabase.rpc("compute_ai_metrics", {
            _user_id: uid,
            _start_date: start30d,
            _end_date: endOfDay,
          }),
          supabase.rpc("compute_executive_summary", {
            _user_id: uid,
            _date: todayStr,
          }),
        ]);

      // Workforce: count online agents
      const { data: presence } = await supabase
        .from("team_presence")
        .select("status")
        .eq("workspace_id", ws.id);

      const onlineAgents =
        presence?.filter((p: any) => p.status === "online").length ?? 0;
      const idleAgents =
        presence?.filter((p: any) => p.status === "idle").length ?? 0;

      // Queue backlog
      const { count: waitingCount } = await supabase
        .from("conversation_threads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .in("status", ["new", "open", "pending"])
        .is("assigned_to", null);

      const workforceMetrics = {
        online_agents: onlineAgents,
        idle_agents: idleAgents,
        conversations_waiting: waitingCount ?? 0,
        overload:
          (waitingCount ?? 0) > (onlineAgents || 1) * 10
            ? "high"
            : (waitingCount ?? 0) > (onlineAgents || 1) * 5
              ? "medium"
              : "low",
        recommendation:
          (waitingCount ?? 0) > (onlineAgents || 1) * 10
            ? "Consider adding more agents or increasing automation"
            : onlineAgents === 0
              ? "No agents online — enable auto-assignment"
              : "Workload is balanced",
      };

      // Upsert daily snapshot
      await supabase.from("analytics_daily_snapshots").upsert(
        {
          user_id: uid,
          workspace_id: ws.id,
          snapshot_date: todayStr,
          agent_metrics: agentRes.data ?? {},
          channel_metrics: channelRes.data ?? {},
          funnel_metrics: funnelRes.data ?? {},
          ai_metrics: aiRes.data ?? {},
          workforce_metrics: workforceMetrics,
          executive_summary: execRes.data ?? {},
        },
        { onConflict: "user_id,workspace_id,snapshot_date" }
      );

      // Create daily notification for workspace owner
      const summary = execRes.data ?? {};
      await supabase.from("business_notifications").insert({
        user_id: uid,
        workspace_id: ws.id,
        title: `Daily Summary — ${todayStr}`,
        message: `Leads today: ${summary.leads_today ?? 0} | Open conversations: ${summary.open_conversations ?? 0} | Revenue potential (30d): $${(summary.revenue_potential_30d ?? 0).toLocaleString()} | Churn alerts: ${summary.churn_risk_alerts ?? 0} | SLA breaches: ${summary.sla_breaches_active ?? 0}`,
        notification_type: "insight",
        category: "daily_summary",
        action_url: "/deep-analytics",
      });

      processed++;
    }

    return new Response(JSON.stringify({ processed, date: todayStr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
