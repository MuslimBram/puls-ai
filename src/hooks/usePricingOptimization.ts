import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserQuery, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

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

export const usePricingOptimizations = () =>
  useUserQuery<PricingOptimizationSuggestion>("pricing_optimization_suggestions", "pricing-optimizations", {
    orderBy: "confidence",
    limit: 30,
  });

export const useAdoptPricingSuggestion = () =>
  useUpdateFieldMutation("pricing_optimization_suggestions", "pricing-optimizations", "Suggestion adopted");

export const usePricingSnapshots = () =>
  useUserQuery<PricingSnapshot>("pricing_analytics_snapshots", "pricing-snapshots", {
    orderBy: "snapshot_date",
    limit: 30,
  });

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
