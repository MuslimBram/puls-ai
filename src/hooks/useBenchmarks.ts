import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export const useBenchmarks = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const scores = useQuery({
    queryKey: ["benchmark-scores", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("benchmark_scores").select("*").order("score_date", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const byCategory = (scores.data ?? []).reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, typeof scores.data>);

  const avgPercentile = scores.data?.length
    ? Math.round(scores.data.reduce((s, b) => s + (b.percentile_rank ?? 50), 0) / scores.data.length)
    : 50;

  return { scores: scores.data ?? [], byCategory, avgPercentile, isLoading: scores.isLoading };
};
