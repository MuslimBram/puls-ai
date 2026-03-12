import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { useState, useCallback } from "react";

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

  const query = useQuery({
    queryKey: ["leads", user?.id, filters, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("leads")
        .select("*", { count: "exact" })
        .eq("user_id", user!.id)
        .order("message_date", { ascending: false })
        .range(from, to);

      if (filters.keyword) q = q.eq("detected_keyword", filters.keyword);
      if (filters.dateFrom) q = q.gte("message_date", filters.dateFrom);
      if (filters.dateTo) q = q.lte("message_date", filters.dateTo);
      if (filters.status) q = q.eq("status", filters.status);

      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], total: count ?? 0 };
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
    const total = query.data?.total ?? 0;
    if ((page + 1) * PAGE_SIZE < total) setPage((p) => p + 1);
  }, [page, query.data?.total]);

  const prevPage = useCallback(() => {
    if (page > 0) setPage((p) => p - 1);
  }, [page]);

  // Reset page on filter change
  const setFiltersAndReset = useCallback((fn: (f: LeadFilters) => LeadFilters) => {
    setPage(0);
    return fn;
  }, []);

  return {
    leads: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    updateStatus,
    page,
    pageSize: PAGE_SIZE,
    nextPage,
    prevPage,
    setPage,
  };
};
