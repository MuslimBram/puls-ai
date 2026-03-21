import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToggleMutation } from "@/hooks/useSupabaseQuery";

export const useCustomerValueMaximization = () => {
  const { user } = useAuth();

  const valueSignals = useQuery({
    queryKey: ["customer-value-signals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_value_signals")
        .select("*")
        .order("lifetime_value_estimate", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const upsellActions = useQuery({
    queryKey: ["upsell-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("upsell_actions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const completeUpsellAction = useToggleMutation("upsell_actions", "upsell-actions");

  const viralTriggers = useQuery({
    queryKey: ["viral-triggers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viral_triggers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const viralAnalytics = useQuery({
    queryKey: ["viral-engagement-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viral_engagement_analytics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return {
    valueSignals: valueSignals.data ?? [],
    valueSignalsLoading: valueSignals.isLoading,
    upsellActions: upsellActions.data ?? [],
    completeUpsellAction,
    viralTriggers: viralTriggers.data ?? [],
    viralAnalytics: viralAnalytics.data ?? [],
  };
};
