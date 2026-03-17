import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type OpsRange = "7d" | "14d" | "30d" | "90d";

const rangeToDate = (r: OpsRange): string => {
  const days = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[r];
  return new Date(Date.now() - days * 86400000).toISOString();
};

// ── Agent Performance ──
export const useAgentPerformance = (range: OpsRange = "30d") => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ops-agent-perf", user?.id, range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_agent_performance", {
        _user_id: user!.id,
        _start_date: rangeToDate(range),
        _end_date: new Date().toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        agent_id: string;
        conversations_handled: number;
        resolved_count: number;
        sla_breaches: number;
        avg_first_response_min: number;
        avg_resolution_hours: number;
        open_now: number;
      }>;
    },
    enabled: !!user,
  });
};

// ── Channel Performance ──
export const useChannelPerformance = (range: OpsRange = "30d") => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ops-channel-perf", user?.id, range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_channel_performance", {
        _user_id: user!.id,
        _start_date: rangeToDate(range),
        _end_date: new Date().toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        channel: string;
        total_messages: number;
        unread_backlog: number;
        avg_response_min: number;
      }>;
    },
    enabled: !!user,
  });
};

// ── Funnel Analytics ──
export const useFunnelAnalytics = (range: OpsRange = "30d") => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ops-funnel", user?.id, range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_funnel_analytics", {
        _user_id: user!.id,
        _start_date: rangeToDate(range),
        _end_date: new Date().toISOString(),
      });
      if (error) throw error;
      return (data ?? {}) as {
        total_leads: number;
        qualified: number;
        deals: number;
        won: number;
        lead_to_qualified_pct: number;
        qualified_to_deal_pct: number;
        deal_to_won_pct: number;
        avg_deal_velocity_days: number;
      };
    },
    enabled: !!user,
  });
};

// ── AI Performance ──
export const useAIPerformanceMetrics = (range: OpsRange = "30d") => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ops-ai-perf", user?.id, range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_ai_metrics", {
        _user_id: user!.id,
        _start_date: rangeToDate(range),
        _end_date: new Date().toISOString(),
      });
      if (error) throw error;
      return (data ?? {}) as {
        total_ai_conversations: number;
        auto_replied: number;
        auto_reply_rate: number;
        drafts_generated: number;
        human_override_ratio: number;
      };
    },
    enabled: !!user,
  });
};

// ── Executive Summary ──
export const useExecutiveSummary = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ops-executive", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_executive_summary", {
        _user_id: user!.id,
        _date: new Date().toISOString().split("T")[0],
      });
      if (error) throw error;
      return (data ?? {}) as {
        date: string;
        leads_today: number;
        revenue_potential_30d: number;
        open_conversations: number;
        churn_risk_alerts: number;
        active_campaigns: number;
        sla_breaches_active: number;
      };
    },
    enabled: !!user,
  });
};

// ── Workforce Dashboard (live) ──
export const useWorkforceDashboard = (workspaceId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ops-workforce", user?.id, workspaceId],
    queryFn: async () => {
      // Online agents
      const { data: presence } = await supabase
        .from("team_presence")
        .select("user_id, status, last_active_at")
        .eq("workspace_id", workspaceId!);

      const online = presence?.filter((p) => p.status === "online") ?? [];
      const idle = presence?.filter((p) => p.status === "idle") ?? [];
      const busy = presence?.filter((p) => p.status === "busy") ?? [];

      // Queue backlog
      const { count: waitingCount } = await supabase
        .from("conversation_threads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .in("status", ["new", "open", "pending"])
        .is("assigned_to", null);

      const agentCount = online.length + idle.length + busy.length || 1;
      const waiting = waitingCount ?? 0;
      const loadPerAgent = Math.round(waiting / agentCount);

      let overload: "low" | "medium" | "high" = "low";
      if (loadPerAgent > 10) overload = "high";
      else if (loadPerAgent > 5) overload = "medium";

      let recommendation = "Workload is balanced";
      if (overload === "high")
        recommendation = "Consider adding more agents or increasing automation";
      else if (online.length === 0)
        recommendation = "No agents online — enable auto-assignment";

      return {
        online: online.length,
        idle: idle.length,
        busy: busy.length,
        total: (presence ?? []).length,
        waiting,
        loadPerAgent,
        overload,
        recommendation,
      };
    },
    enabled: !!user && !!workspaceId,
    refetchInterval: 30000,
  });
};

// ── Daily Snapshots (historical) ──
export const useDailySnapshots = (days: number = 30) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ops-snapshots", user?.id, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("analytics_daily_snapshots")
        .select("*")
        .eq("user_id", user!.id)
        .gte("snapshot_date", since)
        .order("snapshot_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });
};
