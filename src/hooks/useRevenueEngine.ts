import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserQuery, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

export interface RevenueOpportunity {
  id: string;
  opportunity_type: string;
  title: string;
  description: string | null;
  estimated_value: number;
  confidence: number;
  urgency: string;
  status: string;
  suggested_action: string | null;
  source_entity_type: string | null;
  created_at: string;
}

export interface RevenueTrend {
  id: string;
  snapshot_date: string;
  total_revenue: number;
  ai_attributed_revenue: number;
  upsell_revenue: number;
  new_deal_revenue: number;
  trend_signal: string;
}

export const useRevenueOpportunities = () =>
  useUserQuery<RevenueOpportunity>("revenue_opportunities", "revenue-opportunities", {
    orderBy: "estimated_value",
    limit: 50,
  });

export const useActOnOpportunity = () =>
  useUpdateFieldMutation("revenue_opportunities", "revenue-opportunities", "Action recorded");

export const useRevenueTrends = () =>
  useUserQuery<RevenueTrend>("revenue_trend_snapshots", "revenue-trends", {
    orderBy: "snapshot_date",
    limit: 30,
  });

export const useRevenueAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["revenue-engine-analytics", user?.id],
    queryFn: async () => {
      const { data: opps } = await supabase
        .from("revenue_opportunities")
        .select("status, estimated_value, opportunity_type, confidence")
        .eq("user_id", user!.id);

      const all = opps || [];
      const detected = all.filter((o: any) => o.status === "detected");
      const acted = all.filter((o: any) => o.status === "acted");
      const totalValue = all.reduce((s: number, o: any) => s + (Number(o.estimated_value) || 0), 0);
      const actedValue = acted.reduce((s: number, o: any) => s + (Number(o.estimated_value) || 0), 0);

      const byType: Record<string, number> = {};
      for (const o of all) {
        const t = (o as any).opportunity_type;
        byType[t] = (byType[t] || 0) + 1;
      }

      return {
        totalOpportunities: all.length,
        pendingOpportunities: detected.length,
        actedOpportunities: acted.length,
        totalPipelineValue: totalValue,
        actedValue,
        conversionRate: all.length > 0 ? Math.round((acted.length / all.length) * 100) : 0,
        byType,
      };
    },
    enabled: !!user,
  });
};
