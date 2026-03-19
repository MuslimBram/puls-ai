import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useCustomerValueMaximization = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const valueSignals = useQuery({
    queryKey: ["customer-value-signals", workspace?.id],
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
    queryKey: ["upsell-actions", workspace?.id],
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

  const completeUpsellAction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("upsell_actions")
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["upsell-actions"] });
      toast.success("Upsell action completed");
    },
  });

  const viralTriggers = useQuery({
    queryKey: ["viral-triggers", workspace?.id],
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
    queryKey: ["viral-engagement-analytics", workspace?.id],
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
