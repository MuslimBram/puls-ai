import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface PricingOptimizationSuggestion {
  id: string;
  suggestion_type: string;
  title: string;
  description: string | null;
  current_state: any;
  recommended_action: any;
  predicted_impact: any;
  confidence: number;
  status: string;
  adopted_at: string | null;
  outcome: any;
  created_at: string;
}

export interface PricingSnapshot {
  id: string;
  snapshot_date: string;
  conversion_rate: number;
  avg_revenue_per_user: number;
  churn_rate: number;
  upgrade_rate: number;
  trial_conversion_rate: number;
  offer_adoption_rate: number;
}

export const usePricingOptimizations = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pricing-optimizations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_optimization_suggestions")
        .select("*")
        .eq("user_id", user!.id)
        .order("confidence", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as PricingOptimizationSuggestion[];
    },
    enabled: !!user,
  });
};

export const useAdoptPricingSuggestion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pricing_optimization_suggestions")
        .update({ status: "adopted", adopted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-optimizations"] });
      toast.success("Suggestion adopted");
    },
  });
};

export const usePricingSnapshots = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pricing-snapshots", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_analytics_snapshots")
        .select("*")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as PricingSnapshot[];
    },
    enabled: !!user,
  });
};

export const usePricingAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pricing-analytics-summary", user?.id],
    queryFn: async () => {
      const { data: suggestions } = await supabase
        .from("pricing_optimization_suggestions")
        .select("status, suggestion_type, confidence")
        .eq("user_id", user!.id);
      const all = suggestions || [];
      const pending = (all as any[]).filter((s) => s.status === "pending").length;
      const adopted = (all as any[]).filter((s) => s.status === "adopted").length;
      const byType: Record<string, number> = {};
      for (const s of all as any[]) {
        byType[s.suggestion_type] = (byType[s.suggestion_type] || 0) + 1;
      }
      return {
        total: all.length,
        pending,
        adopted,
        adoptionRate: all.length > 0 ? Math.round((adopted / all.length) * 100) : 0,
        byType,
      };
    },
    enabled: !!user,
  });
};
