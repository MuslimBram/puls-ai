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

      const { data, error, count } = await q;
      if (error) throw error;

      const rows = data ?? [];
      const hasMore = rows.length > PAGE_SIZE;
      const pageData = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

      if (hasMore && pageData.length > 0) {
        const lastItem = pageData[pageData.length - 1];
        cursorStack.current[page + 1] = (lastItem as any).message_date;
      }

      return { data: pageData, total: count ?? 0, hasMore };
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
