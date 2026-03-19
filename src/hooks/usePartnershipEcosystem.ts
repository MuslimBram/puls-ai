import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface PartnershipOpportunity {
  id: string;
  partner_name: string;
  match_score: number;
  match_reason: string | null;
  opportunity_type: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PartnershipAction {
  id: string;
  opportunity_id: string | null;
  action_text: string;
  action_type: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface EcosystemSnapshot {
  id: string;
  snapshot_date: string;
  total_partners: number;
  partner_driven_leads: number;
  collaboration_campaigns: number;
  ecosystem_revenue: number;
  partner_retention_rate: number;
}

export const usePartnershipOpportunities = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partnership-opportunities", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partnership_opportunities")
        .select("*")
        .eq("user_id", user!.id)
        .order("match_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as PartnershipOpportunity[];
    },
    enabled: !!user,
  });
};

export const usePartnershipActions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partnership-actions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partnership_actions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as PartnershipAction[];
    },
    enabled: !!user,
  });
};

export const useEcosystemAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ecosystem-analytics", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ecosystem_analytics")
        .select("*")
        .eq("user_id", user!.id)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as EcosystemSnapshot[];
    },
    enabled: !!user,
  });
};

export const useTogglePartnershipAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("partnership_actions")
        .update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partnership-actions"] }),
  });
};

export const useUpdateOpportunityStatus = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("partnership_opportunities")
        .update({ status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partnership-opportunities"] });
      toast({ title: "Status updated" });
    },
  });
};

export const usePartnershipStats = () => {
  const { data: opps } = usePartnershipOpportunities();
  const { data: actions } = usePartnershipActions();
  const { data: analytics } = useEcosystemAnalytics();

  const totalOpportunities = opps?.length ?? 0;
  const activeOpps = opps?.filter((o) => o.status === "suggested" || o.status === "in_progress").length ?? 0;
  const totalActions = actions?.length ?? 0;
  const completedActions = actions?.filter((a) => a.is_completed).length ?? 0;
  const totalPartners = analytics?.[0]?.total_partners ?? 0;

  return { totalOpportunities, activeOpps, totalActions, completedActions, totalPartners };
};
