import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

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

export const useBrandSentiment = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-sentiment", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_sentiment_scores")
        .select("*")
        .eq("user_id", user!.id)
        .order("score_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as BrandSentiment[];
    },
    enabled: !!user,
  });
};

export const useBrandRiskAlerts = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-risk-alerts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_risk_alerts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as BrandRiskAlert[];
    },
    enabled: !!user,
  });
};

export const useResolveBrandAlert = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("brand_risk_alerts")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-risk-alerts"] });
      toast({ title: "Alert resolved" });
    },
  });
};

export const useBrandActions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-actions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_improvement_actions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as BrandAction[];
    },
    enabled: !!user,
  });
};

export const useToggleBrandAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("brand_improvement_actions")
        .update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-actions"] }),
  });
};

export const useCreateBrandAction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { alert_id?: string; action_text: string; action_type?: string }) => {
      const { error } = await supabase.from("brand_improvement_actions").insert({
        ...data,
        user_id: user!.id,
        workspace_id: workspace?.id || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-actions"] });
      toast({ title: "Action created" });
    },
  });
};

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
