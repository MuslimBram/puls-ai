import { useUserQuery, useToggleMutation } from "@/hooks/useSupabaseQuery";

export interface RetentionRisk {
  id: string;
  contact_identifier: string;
  contact_name: string | null;
  risk_score: number;
  risk_level: string;
  declining_engagement: boolean;
  reduced_campaign_interaction: boolean;
  slower_response: boolean;
  drop_in_activity: boolean;
  scored_at: string;
  created_at: string;
}

export interface RetentionAction {
  id: string;
  risk_score_id: string | null;
  action_text: string;
  action_type: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface RetentionAnalyticsSnapshot {
  id: string;
  snapshot_date: string;
  churn_rate: number;
  retention_rate: number;
  avg_lifetime_value: number;
  recovery_count: number;
  at_risk_count: number;
}

export const useRetentionRisks = () =>
  useUserQuery<RetentionRisk>("retention_risk_scores", "retention-risks", {
    orderBy: "risk_score",
    limit: 50,
  });

export const useRetentionActions = () =>
  useUserQuery<RetentionAction>("retention_actions", "retention-actions", { limit: 100 });

export const useRetentionAnalytics = () =>
  useUserQuery<RetentionAnalyticsSnapshot>("retention_analytics", "retention-analytics", {
    orderBy: "snapshot_date",
    limit: 30,
  });

export const useToggleRetentionAction = () =>
  useToggleMutation("retention_actions", "retention-actions");

export const useRetentionStats = () => {
  const { data: risks } = useRetentionRisks();
  const { data: actions } = useRetentionActions();
  const { data: analytics } = useRetentionAnalytics();

  const atRiskCount = risks?.filter((r) => r.risk_level === "high" || r.risk_level === "critical").length ?? 0;
  const totalActions = actions?.length ?? 0;
  const completedActions = actions?.filter((a) => a.is_completed).length ?? 0;
  const latestRetentionRate = analytics?.[0]?.retention_rate ?? 100;
  const latestChurnRate = analytics?.[0]?.churn_rate ?? 0;

  return { atRiskCount, totalActions, completedActions, latestRetentionRate, latestChurnRate };
};
