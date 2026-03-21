import { useUserQuery, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

export interface CxJourneyEvent {
  id: string;
  contact_identifier: string;
  stage: string;
  event_type: string;
  sentiment: string;
  friction_score: number;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

export interface CxRiskAlert {
  id: string;
  alert_type: string;
  title: string;
  description: string | null;
  contact_identifier: string | null;
  severity: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface CxScore {
  id: string;
  score_date: string;
  cx_score: number;
  response_speed_score: number;
  resolution_score: number;
  engagement_score: number;
  data_points: number;
  created_at: string;
}

export const useCxJourneyEvents = () =>
  useUserQuery<CxJourneyEvent>("cx_journey_events", "cx-journey", {
    orderBy: "occurred_at",
    limit: 100,
  });

export const useCxRiskAlerts = () =>
  useUserQuery<CxRiskAlert>("cx_risk_alerts", "cx-risk-alerts", { limit: 50 });

export const useResolveCxAlert = () =>
  useUpdateFieldMutation("cx_risk_alerts", "cx-risk-alerts", "Alert resolved");

export const useCxScores = () =>
  useUserQuery<CxScore>("cx_scores", "cx-scores", {
    orderBy: "score_date",
    limit: 30,
  });

export const useCxStats = () => {
  const { data: scores } = useCxScores();
  const { data: alerts } = useCxRiskAlerts();
  const { data: events } = useCxJourneyEvents();

  const latestCxScore = scores?.[0]?.cx_score ?? 50;
  const activeAlerts = alerts?.filter((a) => !a.is_resolved).length ?? 0;
  const totalEvents = events?.length ?? 0;
  const frictionPoints = events?.filter((e) => e.friction_score > 60).length ?? 0;

  return { latestCxScore, activeAlerts, totalEvents, frictionPoints };
};
