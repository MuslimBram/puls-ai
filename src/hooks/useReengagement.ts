import { useUserQuery, useInsertMutation, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

export interface GrowthExperiment {
  id: string;
  title: string;
  hypothesis: string | null;
  experiment_type: string;
  variant_a: string | null;
  variant_b: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  result_summary: string | null;
  lift_pct: number | null;
  created_at: string;
}

export interface VisitorInactivity {
  id: string;
  contact_identifier: string;
  contact_name: string | null;
  inactivity_score: number;
  days_inactive: number;
  last_interaction_at: string | null;
  inactivity_type: string;
  recommended_channel: string;
  recommended_time: string | null;
  is_reengaged: boolean;
  reengaged_at: string | null;
  created_at: string;
}

export interface ReengagementSnapshot {
  id: string;
  snapshot_date: string;
  reactivation_rate: number;
  engagement_recovery_pct: number;
  campaigns_sent: number;
  churn_prevented: number;
}

export const useGrowthExperiments = () =>
  useUserQuery<GrowthExperiment>("growth_experiments", "growth-experiments", { limit: 50 });

export const useCreateExperiment = () =>
  useInsertMutation("growth_experiments", "growth-experiments", "Experiment created");

export const useUpdateExperimentStatus = () =>
  useUpdateFieldMutation("growth_experiments", "growth-experiments");

export const useVisitorInactivity = () =>
  useUserQuery<VisitorInactivity>("visitor_inactivity_scores", "visitor-inactivity", {
    orderBy: "inactivity_score",
    limit: 50,
    filters: { is_reengaged: false },
  });

export const useMarkReengaged = () =>
  useUpdateFieldMutation("visitor_inactivity_scores", "visitor-inactivity", "Marked as re-engaged");

export const useReengagementAnalytics = () =>
  useUserQuery<ReengagementSnapshot>("reengagement_analytics", "reengagement-analytics", {
    orderBy: "snapshot_date",
    limit: 30,
  });

export const useReengagementStats = () => {
  const { data: inactive } = useVisitorInactivity();
  const { data: experiments } = useGrowthExperiments();
  const { data: analytics } = useReengagementAnalytics();

  const inactiveCount = inactive?.length ?? 0;
  const activeExperiments = experiments?.filter((e) => e.status === "running").length ?? 0;
  const reactivationRate = analytics?.[0]?.reactivation_rate ?? 0;
  const churnPrevented = analytics?.[0]?.churn_prevented ?? 0;

  return { inactiveCount, activeExperiments, reactivationRate, churnPrevented };
};
