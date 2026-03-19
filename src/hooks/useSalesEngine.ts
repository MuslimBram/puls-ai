import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface SalesOutreach {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  outreach_type: string;
  subject: string | null;
  content: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  response_at: string | null;
  ai_generated: boolean;
  created_at: string;
}

export interface HotOpportunity {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  score: number;
  signals: string[];
  estimated_value: number;
  urgency: string;
  recommended_action: string | null;
  created_at: string;
}

export const useHotOpportunities = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["hot-opportunities", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hot_opportunities")
        .select("*")
        .eq("user_id", user!.id)
        .order("score", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as HotOpportunity[];
    },
    enabled: !!user,
  });
};

export const useSalesOutreach = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["sales-outreach", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_outreach")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as SalesOutreach[];
    },
    enabled: !!user,
  });

  const createOutreach = useMutation({
    mutationFn: async (outreach: Partial<SalesOutreach>) => {
      const { error } = await supabase.from("sales_outreach").insert({
        ...outreach,
        user_id: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-outreach"] });
      toast.success("Outreach created");
    },
    onError: (e) => toast.error(e.message),
  });

  return { outreach: query.data ?? [], isLoading: query.isLoading, createOutreach };
};

export const useSalesPerformance = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sales-performance", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_performance_snapshots")
        .select("*")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
};
