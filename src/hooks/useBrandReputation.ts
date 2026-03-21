import { useUserQuery, useToggleMutation, useInsertMutation, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

export interface BrandSentiment {
  id: string;
  score_date: string;
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
  overall_score: number;
  data_points: number;
  created_at: string;
}

export interface BrandRiskAlert {
  id: string;
  alert_type: string;
  title: string;
  description: string | null;
  severity: string;
  is_resolved: boolean;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BrandAction {
  id: string;
  alert_id: string | null;
  action_text: string;
  action_type: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export const useBrandSentiment = () =>
  useUserQuery<BrandSentiment>("brand_sentiment_scores", "brand-sentiment", {
    orderBy: "score_date",
    limit: 30,
  });

export const useBrandRiskAlerts = () =>
  useUserQuery<BrandRiskAlert>("brand_risk_alerts", "brand-risk-alerts", { limit: 50 });

export const useResolveBrandAlert = () =>
  useUpdateFieldMutation("brand_risk_alerts", "brand-risk-alerts", "Alert resolved");

export const useBrandActions = () =>
  useUserQuery<BrandAction>("brand_improvement_actions", "brand-actions", { limit: 100 });

export const useToggleBrandAction = () =>
  useToggleMutation("brand_improvement_actions", "brand-actions");

export const useCreateBrandAction = () =>
  useInsertMutation<{ alert_id?: string; action_text: string; action_type?: string }>(
    "brand_improvement_actions",
    "brand-actions",
    "Action created",
  );

export const useBrandStats = () => {
  const { data: sentiment } = useBrandSentiment();
  const { data: alerts } = useBrandRiskAlerts();
  const { data: actions } = useBrandActions();

  const latestScore = sentiment?.[0]?.overall_score ?? 50;
  const activeAlerts = alerts?.filter((a) => !a.is_resolved).length ?? 0;
  const totalActions = actions?.length ?? 0;
  const completedActions = actions?.filter((a) => a.is_completed).length ?? 0;

  return { latestScore, activeAlerts, totalActions, completedActions };
};
