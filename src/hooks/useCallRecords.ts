import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { useState, useCallback } from "react";

export interface CallRecord {
  id: string;
  workspace_id: string | null;
  user_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  deal_id: string | null;
  channel_provider: string;
  call_direction: string;
  call_status: string;
  call_duration: number;
  call_outcome: string;
  ai_transcription: string | null;
  ai_call_summary: string | null;
  follow_up_recommendation: string | null;
  recording_url: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 25;

export const useCallRecords = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const query = useQuery({
    queryKey: ["call-records", user?.id, page, directionFilter, statusFilter],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("call_records")
        .select("*", { count: "exact" })
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (directionFilter !== "all") q = q.eq("call_direction", directionFilter);
      if (statusFilter !== "all") q = q.eq("call_status", statusFilter);

      const { data, error, count } = await q;
      if (error) throw error;
      return { data: (data ?? []) as unknown as CallRecord[], total: count ?? 0 };
    },
    enabled: !!user,
  });

  const addCall = useMutation({
    mutationFn: async (call: Partial<CallRecord>) => {
      const { error } = await supabase.from("call_records").insert({
        ...call,
        user_id: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-records"] });
      toast.success("Call record added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCall = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CallRecord> & { id: string }) => {
      const { error } = await supabase
        .from("call_records")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["call-records"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const nextPage = useCallback(() => {
    const total = query.data?.total ?? 0;
    if ((page + 1) * PAGE_SIZE < total) setPage((p) => p + 1);
  }, [page, query.data?.total]);

  const prevPage = useCallback(() => {
    if (page > 0) setPage((p) => p - 1);
  }, [page]);

  return {
    calls: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    addCall,
    updateCall,
    page,
    pageSize: PAGE_SIZE,
    nextPage,
    prevPage,
    directionFilter,
    setDirectionFilter,
    statusFilter,
    setStatusFilter,
  };
};
