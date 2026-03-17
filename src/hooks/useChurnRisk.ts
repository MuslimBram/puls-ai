import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ChurnRiskScore {
  id: string;
  user_id: string;
  workspace_id: string | null;
  risk_level: string;
  risk_score: number;
  signals: string[];
  last_active_at: string | null;
  days_inactive: number;
  usage_trend: string;
  leads_trend: number;
  inbox_trend: number;
  login_count_30d: number;
  computed_at: string;
}

export const useChurnRisk = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["churn-risk", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("churn_risk_scores")
        .select("*")
        .eq("user_id", user!.id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ChurnRiskScore | null;
    },
    enabled: !!user,
    staleTime: 300000,
  });

  return { churnRisk: query.data, isLoading: query.isLoading };
};

// Admin: view all churn risks
export const useAllChurnRisks = () => {
  const query = useQuery({
    queryKey: ["all-churn-risks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("churn_risk_scores")
        .select("*")
        .in("risk_level", ["high", "critical"])
        .order("risk_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ChurnRiskScore[];
    },
    staleTime: 60000,
  });

  return { risks: query.data ?? [], isLoading: query.isLoading };
};
