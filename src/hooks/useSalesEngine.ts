import { useUserQuery, useInsertMutation } from "@/hooks/useSupabaseQuery";

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

export const useHotOpportunities = () =>
  useUserQuery<HotOpportunity>("hot_opportunities", "hot-opportunities", {
    orderBy: "score",
    limit: 20,
  });

export const useSalesOutreach = () => {
  const query = useUserQuery<SalesOutreach>("sales_outreach", "sales-outreach", { limit: 50 });
  const createOutreach = useInsertMutation("sales_outreach", "sales-outreach", "Outreach created");
  return { outreach: query.data ?? [], isLoading: query.isLoading, createOutreach };
};

export const useSalesPerformance = () =>
  useUserQuery<any>("sales_performance_snapshots", "sales-performance", {
    orderBy: "snapshot_date",
    limit: 30,
  });
