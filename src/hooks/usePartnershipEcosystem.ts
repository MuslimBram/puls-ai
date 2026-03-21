import { useUserQuery, useToggleMutation, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

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

export const usePartnershipOpportunities = () =>
  useUserQuery<PartnershipOpportunity>("partnership_opportunities", "partnership-opportunities", {
    orderBy: "match_score",
    limit: 50,
  });

export const usePartnershipActions = () =>
  useUserQuery<PartnershipAction>("partnership_actions", "partnership-actions", { limit: 100 });

export const useEcosystemAnalytics = () =>
  useUserQuery<EcosystemSnapshot>("ecosystem_analytics", "ecosystem-analytics", {
    orderBy: "snapshot_date",
    limit: 30,
  });

export const useTogglePartnershipAction = () =>
  useToggleMutation("partnership_actions", "partnership-actions");

export const useUpdateOpportunityStatus = () =>
  useUpdateFieldMutation("partnership_opportunities", "partnership-opportunities", "Status updated");

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
