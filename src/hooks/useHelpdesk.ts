import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { useState, useCallback } from "react";

export interface ConversationThread {
  id: string;
  user_id: string;
  workspace_id: string | null;
  subject: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  channel_type: string;
  contact_name: string | null;
  contact_identifier: string | null;
  ai_summary: string | null;
  sla_response_due: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  last_message_at: string | null;
  message_count: number;
  is_auto_reply_enabled: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  next_response_due: string | null;
  resolution_due: string | null;
  sla_breached: boolean;
  state_changed_at: string | null;
  previous_status: string | null;
}

export interface ConversationNote {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  is_ai_generated: boolean;
  created_at: string;
}

export interface HelpdeskFilters {
  status?: string;
  priority?: string;
  assigned_to?: string;
  search?: string;
}

const PAGE_SIZE = 25;

export const THREAD_STATUSES = [
  { value: "new", label: "New", color: "bg-blue-500/10 text-blue-700" },
  { value: "open", label: "Open", color: "bg-emerald-500/10 text-emerald-700" },
  { value: "pending", label: "Pending", color: "bg-yellow-500/10 text-yellow-700" },
  { value: "resolved", label: "Resolved", color: "bg-green-500/10 text-green-700" },
  { value: "closed", label: "Closed", color: "bg-muted text-muted-foreground" },
];

export const PRIORITY_LEVELS = [
  { value: "low", label: "Low", color: "bg-muted text-muted-foreground" },
  { value: "normal", label: "Normal", color: "bg-secondary text-secondary-foreground" },
  { value: "high", label: "High", color: "bg-orange-500/10 text-orange-700" },
  { value: "urgent", label: "Urgent", color: "bg-destructive/10 text-destructive" },
];

export const useConversationThreads = (filters: HelpdeskFilters = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["conversation-threads", user?.id, filters, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("conversation_threads")
        .select("*", { count: "exact" })
        .eq("user_id", user!.id)
        .order("last_message_at", { ascending: false })
        .range(from, to);

      if (filters.status) q = q.eq("status", filters.status);
      if (filters.priority) q = q.eq("priority", filters.priority);
      if (filters.assigned_to) q = q.eq("assigned_to", filters.assigned_to);
      if (filters.search) q = q.or(`subject.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%`);

      const { data, error, count } = await q;
      if (error) throw error;
      return { data: (data ?? []) as unknown as ConversationThread[], total: count ?? 0 };
    },
    enabled: !!user,
  });

  const createThread = useMutation({
    mutationFn: async (thread: Partial<ConversationThread>) => {
      const { data, error } = await supabase
        .from("conversation_threads")
        .insert({ ...thread, user_id: user!.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ConversationThread;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-threads"] });
      toast.success("Conversation created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateThread = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ConversationThread> & { id: string }) => {
      const { error } = await supabase
        .from("conversation_threads")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversation-threads"] }),
    onError: (e) => toast.error(e.message),
  });

  const nextPage = useCallback(() => {
    const total = query.data?.total ?? 0;
    if ((page + 1) * PAGE_SIZE < total) setPage((p) => p + 1);
  }, [page, query.data?.total]);

  const prevPage = useCallback(() => {
    if (page > 0) setPage((p) => p - 1);
  }, [page]);

  return {
    threads: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    createThread,
    updateThread,
    page,
    pageSize: PAGE_SIZE,
    nextPage,
    prevPage,
    setPage,
  };
};

export const useConversationNotes = (threadId: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversation-notes", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_notes")
        .select("*")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConversationNote[];
    },
    enabled: !!threadId && !!user,
  });

  const addNote = useMutation({
    mutationFn: async ({ content, is_ai_generated }: { content: string; is_ai_generated?: boolean }) => {
      const { error } = await supabase.from("conversation_notes").insert({
        thread_id: threadId,
        user_id: user!.id,
        content,
        is_ai_generated: is_ai_generated ?? false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-notes", threadId] });
      toast.success("Note added");
    },
    onError: (e) => toast.error(e.message),
  });

  return { notes: query.data ?? [], addNote };
};

export const useHelpdeskStats = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["helpdesk-stats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_threads")
        .select("status, priority, sla_response_due, first_response_at, created_at")
        .eq("user_id", user!.id);
      if (error) throw error;

      const threads = data ?? [];
      const now = new Date();
      const overdue = threads.filter(
        (t: any) => t.sla_response_due && new Date(t.sla_response_due) < now && !t.first_response_at && t.status !== "closed"
      ).length;

      const byStatus = THREAD_STATUSES.map((s) => ({
        ...s,
        count: threads.filter((t: any) => t.status === s.value).length,
      }));

      const avgResponseMs = threads
        .filter((t: any) => t.first_response_at)
        .map((t: any) => new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime());
      const avgResponseTime = avgResponseMs.length
        ? Math.round(avgResponseMs.reduce((a: number, b: number) => a + b, 0) / avgResponseMs.length / 60000)
        : 0;

      return { overdue, byStatus, avgResponseTime, total: threads.length };
    },
    enabled: !!user,
  });
};
