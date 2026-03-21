import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

export const useProcessOptimization = () => {
  const { user } = useAuth();

  const bottlenecks = useQuery({
    queryKey: ["process-bottlenecks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_bottlenecks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const resolveBottleneck = useUpdateFieldMutation("process_bottlenecks", "process-bottlenecks", "Bottleneck resolved");

  const postingSchedules = useQuery({
    queryKey: ["posting-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posting_schedules")
        .select("*")
        .order("day_of_week")
        .order("hour_of_day");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const styleRecommendations = useQuery({
    queryKey: ["content-style-recommendations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_style_recommendations")
        .select("*")
        .order("engagement_score", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const adoptStyle = useUpdateFieldMutation("content_style_recommendations", "content-style-recommendations", "Style recommendation adopted");

  const postingAnalytics = useQuery({
    queryKey: ["posting-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posting_analytics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return {
    bottlenecks: bottlenecks.data ?? [],
    bottlenecksLoading: bottlenecks.isLoading,
    resolveBottleneck,
    postingSchedules: postingSchedules.data ?? [],
    styleRecommendations: styleRecommendations.data ?? [],
    adoptStyle,
    postingAnalytics: postingAnalytics.data ?? [],
  };
};
