import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface ChannelData {
  channel_type: string;
  channel_name: string;
  settings?: Record<string, unknown>;
}

export const useChannels = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["channels", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addChannel = useMutation({
    mutationFn: async (channel: ChannelData) => {
      // Server-side limit enforcement
      const { data: limitCheck, error: limitError } = await supabase.functions.invoke("enforce-limits", {
        body: { action: "add", resource: "channels" },
      });
      if (limitError) throw new Error(limitError.message || "Failed to check limits");
      if (limitCheck && !limitCheck.allowed) {
        throw new Error(limitCheck.error || "Channel limit reached. Please upgrade your plan.");
      }

      const row = {
        channel_type: channel.channel_type,
        channel_name: channel.channel_name,
        settings: (channel.settings ?? {}) as any,
        user_id: user!.id,
      };
      const { error } = await supabase.from("channels").insert([row]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel added");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleChannel = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase.from("channels").update({ is_enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel removed");
    },
    onError: (e) => toast.error(e.message),
  });

  return { channels: query.data ?? [], isLoading: query.isLoading, addChannel, toggleChannel, deleteChannel };
};
