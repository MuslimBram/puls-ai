import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useRevenueAttribution = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["revenue-attribution", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("revenue_attribution")
        .select("*")
        .eq("user_id", user!.id)
        .order("attributed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
};

export const useProfitInsights = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profit-insights", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profit_insights")
        .select("*")
        .eq("user_id", user!.id)
        .eq("is_dismissed", false)
        .order("impact_score", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
};

export const useRevenueForecasts = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["revenue-forecasts", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("revenue_forecasts")
        .select("*")
        .eq("user_id", user!.id)
        .order("forecast_date", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
};
