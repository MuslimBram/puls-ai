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

const PAGE_SIZE = 20;

export const useInbox = (filters: InboxFilters = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["inbox", user?.id, filters, page],
    queryFn: async () => {
      let threadsQuery = supabase
        .from("conversation_threads")
        .select("*, inbox_messages(*)", { count: "exact" })
        .eq("user_id", user!.id)
        .eq("is_archived", false)
        .order("last_message_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filters.channelType) threadsQuery = threadsQuery.eq("channel_type", filters.channelType);
      if (filters.status) threadsQuery = threadsQuery.eq("status", filters.status);
      if (filters.priority) threadsQuery = threadsQuery.eq("priority", filters.priority);
      if (filters.dateFrom) threadsQuery = threadsQuery.gte("last_message_at", filters.dateFrom);
      if (filters.dateTo) threadsQuery = threadsQuery.lte("last_message_at", filters.dateTo);
      if (filters.search) {
        const safeSearch = filters.search.replace(/[%_,()]/g, " ").trim();
        if (safeSearch) {
          threadsQuery = threadsQuery.or(
            `contact_name.ilike.%${safeSearch}%,contact_identifier.ilike.%${safeSearch}%,last_message_preview.ilike.%${safeSearch}%`,
          );
        }
      }

      const { data, error, count } = await threadsQuery;
      if (error) throw error;

      const conversations = (data ?? [])
        .map((thread: any) => ({
          ...thread,
          messages: [...(thread.inbox_messages ?? [])].sort(
            (a: any, b: any) =>
              new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime(),
          ),
        }))
        .filter((thread: any) => thread.messages.length > 0);

      const messages = conversations.flatMap((thread: any) =>
        thread.messages.map((message: any) => ({
          ...message,
          conversation_threads: {
            id: thread.id,
            workspace_id: thread.workspace_id,
            contact_identifier: thread.contact_identifier,
            contact_name: thread.contact_name,
            unread_count: thread.unread_count,
          },
        })),
      );

      const total = count ?? 0;
      return {
        data: messages,
        conversations,
        total,
        hasMore: (page + 1) * PAGE_SIZE < total,
      };
    },
    enabled: !!user,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("inbox_messages")
        .update({ is_unread: false })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const markThreadRead = useMutation({
    mutationFn: async (threadId: string) => {
      const [messagesResult, threadResult] = await Promise.all([
        supabase
          .from("inbox_messages")
          .update({ is_unread: false })
          .eq("thread_id", threadId)
          .eq("user_id", user!.id),
        supabase
          .from("conversation_threads")
          .update({ unread_count: 0 })
          .eq("id", threadId)
          .eq("user_id", user!.id),
      ]);
      if (messagesResult.error) throw messagesResult.error;
      if (threadResult.error) throw threadResult.error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, threadId, status }: { id: string; threadId?: string; status: string }) => {
      const messageResult = await supabase
        .from("inbox_messages")
        .update({ status })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (messageResult.error) throw messageResult.error;

      if (threadId) {
        const threadResult = await supabase
          .from("conversation_threads")
          .update({ status })
          .eq("id", threadId)
          .eq("user_id", user!.id);
        if (threadResult.error) throw threadResult.error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const updatePriority = useMutation({
    mutationFn: async ({ id, threadId, priority }: { id: string; threadId?: string; priority: string }) => {
      const messageResult = await supabase
        .from("inbox_messages")
        .update({ priority })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (messageResult.error) throw messageResult.error;

      if (threadId) {
        const threadResult = await supabase
          .from("conversation_threads")
          .update({ priority })
          .eq("id", threadId)
          .eq("user_id", user!.id);
        if (threadResult.error) throw threadResult.error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const subscribeRealtime = () => {
    return supabase
      .channel(`inbox-realtime-${user?.id || "anonymous"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_messages", filter: `user_id=eq.${user?.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_threads", filter: `user_id=eq.${user?.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["inbox"] }),
      )
      .subscribe();
  };

  const nextPage = useCallback(() => {
    if (query.data?.hasMore) setPage((currentPage) => currentPage + 1);
  }, [query.data?.hasMore]);

  const prevPage = useCallback(() => {
    if (page > 0) setPage((currentPage) => currentPage - 1);
  }, [page]);

  const resetPagination = useCallback(() => setPage(0), []);

  return {
    messages: query.data?.data ?? [],
    conversations: query.data?.conversations ?? [],
    total: query.data?.total ?? 0,
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    markRead,
    markThreadRead,
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
