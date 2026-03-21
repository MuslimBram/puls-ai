import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserQuery, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

export interface MarketExpansionOpportunity {
  id: string;
  opportunity_type: string;
  title: string;
  description: string | null;
  region: string | null;
  segment: string | null;
  readiness_score: number;
  confidence: number;
  status: string;
  signals: any;
  action_checklist: any;
  performance: any;
  created_at: string;
}

export const useMarketExpansionOpportunities = () =>
  useUserQuery<MarketExpansionOpportunity>("market_expansion_opportunities", "market-expansion", {
    orderBy: "readiness_score",
    ascending: false,
    limit: 30,
  });

export const useActOnExpansion = () =>
  useUpdateFieldMutation("market_expansion_opportunities", "market-expansion", "Expansion action recorded");

export const useExpansionAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["expansion-analytics", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_expansion_opportunities")
        .select("status, opportunity_type, readiness_score, region")
        .eq("user_id", user!.id);
      const all = data || [];
      const regions = new Set((all as any[]).map((o) => o.region).filter(Boolean));
      const segments = (all as any[]).filter((o) => o.opportunity_type === "segment").length;
      const acted = (all as any[]).filter((o) => o.status === "acted").length;
      const avgReadiness = all.length > 0
        ? Math.round((all as any[]).reduce((s, o) => s + Number(o.readiness_score || 0), 0) / all.length)
        : 0;
      return { total: all.length, regions: regions.size, segments, acted, avgReadiness };
    },
    enabled: !!user,
  });
};
