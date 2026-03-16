import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface ContactSegment {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  filter_criteria: Record<string, unknown>;
  contact_count: number;
  created_at: string;
}

export interface Broadcast {
  id: string;
  user_id: string;
  campaign_id: string | null;
  segment_id: string | null;
  name: string;
  channel_type: string;
  subject: string | null;
  message_content: string;
  template_data: Record<string, unknown>;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  throttle_per_minute: number;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  failed_count: number;
  response_count: number;
  created_at: string;
}

export const useContactSegments = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["contact-segments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_segments")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContactSegment[];
    },
    enabled: !!user,
  });

  const createSegment = useMutation({
    mutationFn: async (segment: Partial<ContactSegment>) => {
      const { data, error } = await supabase
        .from("contact_segments")
        .insert({ ...segment, user_id: user!.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-segments"] });
      toast.success("Segment created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-segments"] });
      toast.success("Segment deleted");
    },
  });

  return { segments: query.data ?? [], isLoading: query.isLoading, createSegment, deleteSegment };
};

export const useBroadcasts = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["broadcasts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Broadcast[];
    },
    enabled: !!user,
  });

  const createBroadcast = useMutation({
    mutationFn: async (broadcast: Partial<Broadcast>) => {
      const { data, error } = await supabase
        .from("broadcasts")
        .insert({ ...broadcast, user_id: user!.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateBroadcast = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Broadcast> & { id: string }) => {
      const { error } = await supabase
        .from("broadcasts")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["broadcasts"] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteBroadcast = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("broadcasts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast deleted");
    },
  });

  return { broadcasts: query.data ?? [], isLoading: query.isLoading, createBroadcast, updateBroadcast, deleteBroadcast };
};
