import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

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

export const useRevenueOpportunities = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["revenue-opportunities", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_opportunities")
        .select("*")
        .eq("user_id", user!.id)
        .order("estimated_value", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as RevenueOpportunity[];
    },
    enabled: !!user,
  });
};

export const useActOnOpportunity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const { error } = await supabase
        .from("revenue_opportunities")
        .update({
          status: "acted",
          outcome: action,
          action_taken_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenue-opportunities"] });
      toast.success("Action recorded");
    },
  });
};

export const useRevenueTrends = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["revenue-trends", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_trend_snapshots")
        .select("*")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as RevenueTrend[];
    },
    enabled: !!user,
  });
};

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
