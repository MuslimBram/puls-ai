import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useSaaSMetrics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["saas-metrics", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("saas_metrics_snapshots")
        .select("*")
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 60000,
  });
};

export const useCohortRetention = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cohort-retention", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cohort_retention")
        .select("*")
        .order("cohort_month", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 300000,
  });
};

export const usePlatformHealth = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["platform-health", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_health_checks")
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 30000,
  });
};
