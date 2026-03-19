import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

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

export const useGrowthExperiments = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["growth-experiments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("growth_experiments")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as GrowthExperiment[];
    },
    enabled: !!user,
  });
};

export const useCreateExperiment = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { title: string; hypothesis?: string; experiment_type?: string; variant_a?: string; variant_b?: string }) => {
      const { error } = await supabase.from("growth_experiments").insert({
        ...data,
        user_id: user!.id,
        workspace_id: workspace?.id || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-experiments"] });
      toast({ title: "Experiment created" });
    },
  });
};

export const useUpdateExperimentStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "running") updates.started_at = new Date().toISOString();
      if (status === "completed") updates.ended_at = new Date().toISOString();
      const { error } = await supabase.from("growth_experiments").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth-experiments"] }),
  });
};

export const useVisitorInactivity = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["visitor-inactivity", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitor_inactivity_scores")
        .select("*")
        .eq("user_id", user!.id)
        .eq("is_reengaged", false)
        .order("inactivity_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as VisitorInactivity[];
    },
    enabled: !!user,
  });
};

export const useMarkReengaged = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("visitor_inactivity_scores")
        .update({ is_reengaged: true, reengaged_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitor-inactivity"] });
      toast({ title: "Marked as re-engaged" });
    },
  });
};

export const useReengagementAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["reengagement-analytics", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reengagement_analytics")
        .select("*")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as ReengagementSnapshot[];
    },
    enabled: !!user,
  });
};

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
