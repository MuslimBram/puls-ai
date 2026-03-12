import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useCallback } from "react";

export interface InboxFilters {
  channelType?: string;
  status?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

const PAGE_SIZE = 30;

export const useInbox = (filters: InboxFilters = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["inbox", user?.id, filters, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("inbox_messages")
        .select("*", { count: "exact" })
        .eq("user_id", user!.id)
        .order("message_timestamp", { ascending: false })
        .range(from, to);

      if (filters.channelType) q = q.eq("channel_type", filters.channelType);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.priority) q = q.eq("priority", filters.priority);
      if (filters.dateFrom) q = q.gte("message_timestamp", filters.dateFrom);
      if (filters.dateTo) q = q.lte("message_timestamp", filters.dateTo);
      if (filters.search) q = q.or(`message_content.ilike.%${filters.search}%,sender_name.ilike.%${filters.search}%`);

      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], total: count ?? 0 };
    },
    enabled: !!user,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("inbox_messages")
        .update({ is_unread: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("inbox_messages")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const updatePriority = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: string }) => {
      const { error } = await supabase
        .from("inbox_messages")
        .update({ priority })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const subscribeRealtime = () => {
    return supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_messages", filter: `user_id=eq.${user?.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["inbox"] })
      )
      .subscribe();
  };

  const nextPage = useCallback(() => {
    const total = query.data?.total ?? 0;
    if ((page + 1) * PAGE_SIZE < total) setPage((p) => p + 1);
  }, [page, query.data?.total]);

  const prevPage = useCallback(() => {
    if (page > 0) setPage((p) => p - 1);
  }, [page]);

  return {
    messages: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    markRead,
    updateStatus,
    updatePriority,
    subscribeRealtime,
    page,
    pageSize: PAGE_SIZE,
    nextPage,
    prevPage,
    setPage,
  };
};
