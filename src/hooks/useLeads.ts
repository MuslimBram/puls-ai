import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { useState, useCallback, useRef } from "react";

export interface LeadFilters {
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  intentType?: string;
}

const PAGE_SIZE = 25;

export const useLeads = (filters: LeadFilters = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const cursorStack = useRef<(string | null)[]>([null]);

  const query = useQuery({
    queryKey: ["leads", user?.id, filters, page],
    queryFn: async () => {
      const cursor = cursorStack.current[page] ?? null;

      let q = supabase
        .from("leads")
        .select("*", { count: "exact" })
        .eq("user_id", user!.id)
        .order("message_date", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (cursor) {
        q = q.lt("message_date", cursor);
      }

      if (filters.keyword) q = q.eq("detected_keyword", filters.keyword);
      if (filters.dateFrom) q = q.gte("message_date", filters.dateFrom);
      if (filters.dateTo) q = q.lte("message_date", filters.dateTo);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.intentType) q = q.eq("intent_type", filters.intentType);

      const { data, error, count } = await q;
      if (error) throw error;

      const rows = data ?? [];
      const hasMore = rows.length > PAGE_SIZE;
      const pageData = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      const leadIds = pageData.map((lead) => lead.id);

      if (hasMore && pageData.length > 0) {
        const lastItem = pageData[pageData.length - 1];
        cursorStack.current[page + 1] = (lastItem as any).message_date;
      }

      let scoreMap = new Map<string, {
        score: number;
        churn_risk: number | null;
        score_factors: unknown;
        last_scored_at: string;
      }>();

      if (leadIds.length > 0) {
        const { data: scoreRows, error: scoreError } = await supabase
          .from("lead_scores")
          .select("lead_id, score, churn_risk, score_factors, last_scored_at")
          .in("lead_id", leadIds);

        if (scoreError) throw scoreError;

        scoreMap = new Map(
          (scoreRows ?? [])
            .filter((row) => !!row.lead_id)
            .map((row) => [row.lead_id as string, {
              score: row.score,
              churn_risk: row.churn_risk,
              score_factors: row.score_factors,
              last_scored_at: row.last_scored_at,
            }]),
        );
      }

      const enrichedData = pageData.map((lead) => {
        const leadScore = scoreMap.get(lead.id);
        return {
          ...lead,
          ai_score: leadScore?.score ?? null,
          churn_risk: leadScore?.churn_risk ?? null,
          score_factors: leadScore?.score_factors ?? null,
          last_scored_at: leadScore?.last_scored_at ?? null,
        };
      });

      return { data: enrichedData, total: count ?? 0, hasMore };
    },
    enabled: !!user,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated");
    },
  });

  const nextPage = useCallback(() => {
    if (query.data?.hasMore) setPage((p) => p + 1);
  }, [query.data?.hasMore]);

  const prevPage = useCallback(() => {
    if (page > 0) setPage((p) => p - 1);
  }, [page]);

  const resetPagination = useCallback(() => {
    setPage(0);
    cursorStack.current = [null];
  }, []);

  return {
    leads: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    updateStatus,
    page,
    pageSize: PAGE_SIZE,
    nextPage,
    prevPage,
    setPage,
    resetPagination,
  };
};