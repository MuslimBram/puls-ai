import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useProcessOptimization = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const bottlenecks = useQuery({
    queryKey: ["process-bottlenecks", workspace?.id],
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

  const resolveBottleneck = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("process_bottlenecks")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["process-bottlenecks"] });
      toast.success("Bottleneck resolved");
    },
  });

  const postingSchedules = useQuery({
    queryKey: ["posting-schedules", workspace?.id],
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
    queryKey: ["content-style-recommendations", workspace?.id],
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

  const adoptStyle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("content_style_recommendations")
        .update({ is_adopted: true, adopted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-style-recommendations"] });
      toast.success("Style recommendation adopted");
    },
  });

  const postingAnalytics = useQuery({
    queryKey: ["posting-analytics", workspace?.id],
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
