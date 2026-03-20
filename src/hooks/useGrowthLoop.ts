import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export const useGrowthLoop = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const metrics = useQuery({
    queryKey: ["growth-loop-metrics", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("growth_loop_metrics").select("*").order("metric_date", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const latest = metrics.data?.[0];
  const viralCoefficient = Number(latest?.viral_coefficient ?? 0);

  return { metrics: metrics.data ?? [], latest, viralCoefficient, isLoading: metrics.isLoading };
};
