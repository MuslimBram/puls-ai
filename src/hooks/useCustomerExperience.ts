import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

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

export const useCxJourneyEvents = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cx-journey", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cx_journey_events")
        .select("*")
        .eq("user_id", user!.id)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as CxJourneyEvent[];
    },
    enabled: !!user,
  });
};

export const useCxRiskAlerts = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cx-risk-alerts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cx_risk_alerts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as CxRiskAlert[];
    },
    enabled: !!user,
  });
};

export const useResolveCxAlert = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cx_risk_alerts")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cx-risk-alerts"] });
      toast({ title: "Alert resolved" });
    },
  });
};

export const useCxScores = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cx-scores", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cx_scores")
        .select("*")
        .eq("user_id", user!.id)
        .order("score_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as CxScore[];
    },
    enabled: !!user,
  });
};

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
