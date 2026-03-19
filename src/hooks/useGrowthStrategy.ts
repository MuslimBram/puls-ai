import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface GrowthStrategy {
  id: string;
  title: string;
  summary: string | null;
  strategy_type: string;
  status: string;
  ai_analysis: any;
  action_items: any;
  competitive_signals: any;
  experiments: any;
  impact_metrics: any;
  period_start: string | null;
  period_end: string | null;
  adopted_at: string | null;
  created_at: string;
}

export interface GrowthActionItem {
  id: string;
  strategy_id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export const useGrowthStrategies = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["growth-strategies", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("growth_strategies")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as GrowthStrategy[];
    },
    enabled: !!user,
  });
};

export const useCreateStrategy = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  return useMutation({
    mutationFn: async (strategy: { title: string; summary?: string; strategy_type?: string }) => {
      const { error } = await supabase
        .from("growth_strategies")
        .insert({ user_id: user!.id, workspace_id: workspace?.id, ...strategy } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-strategies"] });
      toast.success("Strategy created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useAdoptStrategy = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("growth_strategies")
        .update({ status: "adopted", adopted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-strategies"] });
      toast.success("Strategy adopted");
    },
  });
};

export const useActionItems = (strategyId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["growth-action-items", strategyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("growth_action_items")
        .select("*")
        .eq("strategy_id", strategyId!)
        .eq("user_id", user!.id)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as GrowthActionItem[];
    },
    enabled: !!strategyId && !!user,
  });
};

export const useToggleActionItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("growth_action_items")
        .update({
          status: completed ? "completed" : "pending",
          completed_at: completed ? new Date().toISOString() : null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth-action-items"] }),
  });
};

export const useGrowthAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["growth-analytics", user?.id],
    queryFn: async () => {
      const { data: strategies } = await supabase
        .from("growth_strategies")
        .select("status")
        .eq("user_id", user!.id);
      const all = strategies || [];
      const adopted = all.filter((s: any) => s.status === "adopted").length;
      return {
        total: all.length,
        adopted,
        adoptionRate: all.length > 0 ? Math.round((adopted / all.length) * 100) : 0,
        draft: all.filter((s: any) => s.status === "draft").length,
      };
    },
    enabled: !!user,
  });
};
