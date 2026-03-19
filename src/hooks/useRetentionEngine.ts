import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

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

export const useRetentionRisks = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["retention-risks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retention_risk_scores")
        .select("*")
        .eq("user_id", user!.id)
        .order("risk_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as RetentionRisk[];
    },
    enabled: !!user,
  });
};

export const useRetentionActions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["retention-actions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retention_actions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as RetentionAction[];
    },
    enabled: !!user,
  });
};

export const useRetentionAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["retention-analytics", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retention_analytics")
        .select("*")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as RetentionAnalyticsSnapshot[];
    },
    enabled: !!user,
  });
};

export const useToggleRetentionAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("retention_actions")
        .update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retention-actions"] }),
  });
};

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
