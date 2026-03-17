import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useCallback, useRef } from "react";

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
  // Cursor stack for cursor-based pagination
  const cursorStack = useRef<(string | null)[]>([null]);

  const query = useQuery({
    queryKey: ["inbox", user?.id, filters, page],
    queryFn: async () => {
      const cursor = cursorStack.current[page] ?? null;

      let q = supabase
        .from("inbox_messages")
        .select("*", { count: "exact" })
        .eq("user_id", user!.id)
        .order("message_timestamp", { ascending: false })
        .limit(PAGE_SIZE + 1); // fetch one extra to detect hasMore

      // Cursor: fetch items older than the last seen timestamp
      if (cursor) {
        q = q.lt("message_timestamp", cursor);
      }

      if (filters.channelType) q = q.eq("channel_type", filters.channelType);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.priority) q = q.eq("priority", filters.priority);
      if (filters.dateFrom) q = q.gte("message_timestamp", filters.dateFrom);
      if (filters.dateTo) q = q.lte("message_timestamp", filters.dateTo);
      if (filters.search) q = q.or(`message_content.ilike.%${filters.search}%,sender_name.ilike.%${filters.search}%`);

      const { data, error, count } = await q;
      if (error) throw error;

      const rows = data ?? [];
      const hasMore = rows.length > PAGE_SIZE;
      const pageData = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

      // Store next cursor
      if (hasMore && pageData.length > 0) {
        const lastItem = pageData[pageData.length - 1];
        cursorStack.current[page + 1] = (lastItem as any).message_timestamp;
      }

      return { data: pageData, total: count ?? 0, hasMore };
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
    messages: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    hasMore: query.data?.hasMore ?? false,
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
    resetPagination,
  };
};
