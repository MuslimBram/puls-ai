import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToggleMutation } from "@/hooks/useSupabaseQuery";

export const useFunnelOptimization = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const stages = useQuery({
    queryKey: ["funnel-stages", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_stages")
        .select("*")
        .order("stage_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const optimizations = useQuery({
    queryKey: ["funnel-optimizations", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_optimizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const completeOptimization = useToggleMutation(
    "funnel_optimizations",
    "funnel-optimizations",
    "is_completed",
    "completed_at",
  );

  const experiments = useQuery({
    queryKey: ["funnel-experiments", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_experiments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const analytics = useQuery({
    queryKey: ["funnel-analytics", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_analytics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return {
    stages: stages.data ?? [],
    stagesLoading: stages.isLoading,
    optimizations: optimizations.data ?? [],
    completeOptimization,
    experiments: experiments.data ?? [],
    analytics: analytics.data ?? [],
  };
};
