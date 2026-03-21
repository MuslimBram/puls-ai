import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToggleMutation } from "@/hooks/useSupabaseQuery";

export const useOfferOptimization = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const analysis = useQuery({
    queryKey: ["offer-analysis", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_analysis")
        .select("*")
        .order("engagement_score", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const suggestions = useQuery({
    queryKey: ["offer-suggestions", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_suggestions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const adoptSuggestion = useToggleMutation(
    "offer_suggestions",
    "offer-suggestions",
    "is_adopted",
    "adopted_at",
  );

  const experiments = useQuery({
    queryKey: ["offer-experiments", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_experiments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const analytics = useQuery({
    queryKey: ["offer-analytics", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_analytics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return {
    analysis: analysis.data ?? [],
    analysisLoading: analysis.isLoading,
    suggestions: suggestions.data ?? [],
    adoptSuggestion,
    experiments: experiments.data ?? [],
    analytics: analytics.data ?? [],
  };
};
