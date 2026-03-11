import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InboxFilters {
  channelType?: string;
  status?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export const useInbox = (filters: InboxFilters = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["inbox", user?.id, filters],
    queryFn: async () => {
      let q = supabase
        .from("inbox_messages")
        .select("*")
        .eq("user_id", user!.id)
        .order("message_timestamp", { ascending: false });

      if (filters.channelType) q = q.eq("channel_type", filters.channelType);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.priority) q = q.eq("priority", filters.priority);
      if (filters.dateFrom) q = q.gte("message_timestamp", filters.dateFrom);
      if (filters.dateTo) q = q.lte("message_timestamp", filters.dateTo);
      if (filters.search) q = q.or(`message_content.ilike.%${filters.search}%,sender_name.ilike.%${filters.search}%`);

      const { data, error } = await q;
      if (error) throw error;
      return data;
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

  // Realtime subscription
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

  return {
    messages: query.data ?? [],
    isLoading: query.isLoading,
    markRead,
    updateStatus,
    updatePriority,
    subscribeRealtime,
  };
};
