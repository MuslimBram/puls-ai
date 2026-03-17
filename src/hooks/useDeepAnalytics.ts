import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";
import { subDays, format, parseISO, isAfter } from "date-fns";

export type AnalyticsRange = "7d" | "14d" | "30d" | "90d";

const rangeDays = (r: AnalyticsRange) => ({ "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[r]);

export const useDeepAnalytics = (dateRange: AnalyticsRange) => {
  const { user } = useAuth();
  const days = rangeDays(dateRange);
  const rangeStart = subDays(new Date(), days);
  const prevStart = subDays(rangeStart, days);

  const leadsQuery = useQuery({
    queryKey: ["deep-analytics-leads", user?.id, dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, source_name, message_date, intent_score, status, detected_keyword")
        .eq("user_id", user!.id)
        .gte("message_date", prevStart.toISOString())
        .order("message_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const inboxQuery = useQuery({
    queryKey: ["deep-analytics-inbox", user?.id, dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("inbox_messages")
        .select("created_at, first_response_at, status, channel_type")
        .eq("user_id", user!.id)
        .gte("created_at", rangeStart.toISOString());
      return data ?? [];
    },
    enabled: !!user,
  });

  const dealsQuery = useQuery({
    queryKey: ["deep-analytics-deals", user?.id, dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("deals")
        .select("deal_value, created_at, won_at, lost_at, source_channel")
        .eq("user_id", user!.id)
        .gte("created_at", prevStart.toISOString());
      return data ?? [];
    },
    enabled: !!user,
  });

  const broadcastsQuery = useQuery({
    queryKey: ["deep-analytics-broadcasts", user?.id, dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("name, sent_count, delivered_count, opened_count, clicked_count, response_count, created_at, status")
        .eq("user_id", user!.id)
        .gte("created_at", rangeStart.toISOString());
      return data ?? [];
    },
    enabled: !!user,
  });

  const automationQuery = useQuery({
    queryKey: ["deep-analytics-automations", user?.id, dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("automation_logs")
        .select("status, duration_ms, trigger_event, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", rangeStart.toISOString());
      return data ?? [];
    },
    enabled: !!user,
  });

  const aiQuery = useQuery({
    queryKey: ["deep-analytics-ai", user?.id, dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_conversations")
        .select("is_auto_reply, status, complexity, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", rangeStart.toISOString());
      return data ?? [];
    },
    enabled: !!user,
  });

  const churnQuery = useQuery({
    queryKey: ["deep-analytics-churn", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("churn_risk_scores")
        .select("risk_level, risk_score, signals, days_inactive, usage_trend, computed_at")
        .eq("user_id", user!.id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const leadScoresQuery = useQuery({
    queryKey: ["deep-analytics-lead-scores", user?.id, dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_scores")
        .select("lead_id, score, churn_risk, predicted_value, last_scored_at, leads!inner(id, user_id, message_date, source_name, status)")
        .eq("leads.user_id", user!.id)
        .gte("leads.message_date", rangeStart.toISOString())
        .order("last_scored_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const metrics = useMemo(() => {
    const leads = leadsQuery.data ?? [];
    const inbox = inboxQuery.data ?? [];
    const deals = dealsQuery.data ?? [];
    const broadcasts = broadcastsQuery.data ?? [];
    const automations = automationQuery.data ?? [];
    const aiConvos = aiQuery.data ?? [];
    const churn = churnQuery.data;
    const leadScores = leadScoresQuery.data ?? [];

    const currentLeads = leads.filter((l: any) => isAfter(parseISO(l.message_date), rangeStart));
    const prevLeads = leads.filter((l: any) => !isAfter(parseISO(l.message_date), rangeStart));

    const leadsByChannel: Record<string, number> = {};
    currentLeads.forEach((l: any) => {
      leadsByChannel[l.source_name] = (leadsByChannel[l.source_name] || 0) + 1;
    });

    const channelTrend = Array.from({ length: days }, (_, i) => {
      const day = subDays(new Date(), days - 1 - i);
      const dayStr = format(day, "yyyy-MM-dd");
      const dayLeads = currentLeads.filter((l: any) => format(parseISO(l.message_date), "yyyy-MM-dd") === dayStr);
      const bySource: Record<string, number> = {};
      dayLeads.forEach((l: any) => { bySource[l.source_name] = (bySource[l.source_name] || 0) + 1; });
      return { date: format(day, days > 14 ? "MMM d" : "EEE"), total: dayLeads.length, ...bySource };
    });

    const responseTimes = inbox
      .filter((m: any) => m.first_response_at)
      .map((m: any) => (new Date(m.first_response_at).getTime() - new Date(m.created_at).getTime()) / 60000);
    const avgResponseMin = responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    const pipelineTrend = Array.from({ length: days }, (_, i) => {
      const day = subDays(new Date(), days - 1 - i);
      const dayStr = format(day, "yyyy-MM-dd");
      const dayDeals = deals.filter((d: any) => format(parseISO(d.created_at), "yyyy-MM-dd") === dayStr);
      const value = dayDeals.reduce((s: number, d: any) => s + (d.deal_value || 0), 0);
      return { date: format(day, days > 14 ? "MMM d" : "EEE"), value };
    });

    const campaignPerf = broadcasts.map((b: any) => ({
      name: b.name,
      sent: b.sent_count || 0,
      delivered: b.delivered_count || 0,
      opened: b.opened_count || 0,
      clicked: b.clicked_count || 0,
      responses: b.response_count || 0,
      deliveryRate: b.sent_count ? Math.round(((b.delivered_count || 0) / b.sent_count) * 100) : 0,
      openRate: b.delivered_count ? Math.round(((b.opened_count || 0) / b.delivered_count) * 100) : 0,
    }));

    const autoSuccess = automations.filter((a: any) => a.status === "success").length;
    const autoFailed = automations.filter((a: any) => a.status === "error").length;
    const autoAvgDuration = automations.length
      ? Math.round(automations.reduce((s: number, a: any) => s + (a.duration_ms || 0), 0) / automations.length)
      : 0;

    const aiTotal = aiConvos.length;
    const aiAutoReplied = aiConvos.filter((a: any) => a.is_auto_reply).length;
    const aiAutoReplyRate = aiTotal > 0 ? Math.round((aiAutoReplied / aiTotal) * 100) : 0;
    const aiByComplexity: Record<string, number> = {};
    aiConvos.forEach((a: any) => {
      aiByComplexity[a.complexity] = (aiByComplexity[a.complexity] || 0) + 1;
    });

    const churnRiskLevel = churn?.risk_level ?? "unknown";
    const churnScore = churn?.risk_score ?? 0;
    const churnSignals = churn?.signals ?? [];
    const churnDaysInactive = churn?.days_inactive ?? 0;

    const leadGrowth = prevLeads.length ? Math.round(((currentLeads.length - prevLeads.length) / prevLeads.length) * 100) : 0;

    const currentDeals = deals.filter((d: any) => isAfter(parseISO(d.created_at), rangeStart));
    const currentPipelineValue = currentDeals.reduce((s: number, d: any) => s + (d.deal_value || 0), 0);
    const wonCount = currentDeals.filter((d: any) => d.won_at).length;
    const lostCount = currentDeals.filter((d: any) => d.lost_at).length;
    const conversionRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;

    const predictedPipelineValue = leadScores.reduce((sum: number, row: any) => sum + (row.predicted_value || 0), 0);
    const avgPredictedLeadScore = leadScores.length > 0
      ? Math.round(leadScores.reduce((sum: number, row: any) => sum + (row.score || 0), 0) / leadScores.length)
      : 0;
    const hotLeads = leadScores.filter((row: any) => (row.score || 0) >= 75).length;
    const scoredLeadCoverage = currentLeads.length > 0 ? Math.round((leadScores.length / currentLeads.length) * 100) : 0;
    const topPredictedLeads = leadScores
      .slice()
      .sort((a: any, b: any) => (b.predicted_value || 0) - (a.predicted_value || 0))
      .slice(0, 5)
      .map((row: any) => ({
        id: row.lead_id,
        sourceName: row.leads?.source_name || "Lead",
        status: row.leads?.status || "new",
        predictedValue: row.predicted_value || 0,
        score: row.score || 0,
      }));

    return {
      leadsByChannel: Object.entries(leadsByChannel).map(([name, value]) => ({ name, value })),
      channelTrend,
      avgResponseMin,
      pipelineTrend,
      campaignPerf,
      currentPipelineValue,
      predictedPipelineValue,
      avgPredictedLeadScore,
      hotLeads,
      scoredLeadCoverage,
      topPredictedLeads,
      conversionRate,
      leadGrowth,
      totalLeads: currentLeads.length,
      totalMessages: inbox.length,
      autoSuccess,
      autoFailed,
      autoAvgDuration,
      autoTotal: automations.length,
      channels: Object.keys(leadsByChannel),
      aiTotal,
      aiAutoReplied,
      aiAutoReplyRate,
      aiByComplexity: Object.entries(aiByComplexity).map(([name, value]) => ({ name, value })),
      churnRiskLevel,
      churnScore,
      churnSignals,
      churnDaysInactive,
    };
  }, [leadsQuery.data, inboxQuery.data, dealsQuery.data, broadcastsQuery.data, automationQuery.data, aiQuery.data, churnQuery.data, leadScoresQuery.data, rangeStart, days]);

  return {
    ...metrics,
    isLoading: leadsQuery.isLoading || inboxQuery.isLoading || dealsQuery.isLoading || leadScoresQuery.isLoading,
  };
};