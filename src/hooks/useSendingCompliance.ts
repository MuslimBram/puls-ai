import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

// ── Global Suppression List ──
export const useSuppressionList = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["suppression-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("global_suppression_list")
        .select("*")
        .eq("user_id", user!.id)
        .order("suppressed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  return { suppressions: query.data ?? [], isLoading: query.isLoading };
};

export const useAddSuppression = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      contact_identifier: string;
      channel_type: string;
      suppression_type: string;
      reason?: string;
    }) => {
      const { error } = await supabase.from("global_suppression_list").insert({
        user_id: user!.id,
        contact_identifier: params.contact_identifier,
        channel_type: params.channel_type,
        suppression_type: params.suppression_type,
        reason: params.reason || "manual",
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      toast.success("Contact added to suppression list");
    },
    onError: (e) => toast.error(e.message),
  });
};

export const useRemoveSuppression = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("global_suppression_list")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      toast.success("Suppression removed");
    },
    onError: (e) => toast.error(e.message),
  });
};

// ── Sending Reputation ──
export const useSendingReputation = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["sending-reputation", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sending_reputation")
        .select("*")
        .eq("user_id", user!.id)
        .order("channel_type");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  return { reputation: query.data ?? [], isLoading: query.isLoading };
};

// ── Send Queue Status ──
export const useSendQueueStats = (broadcastId?: string) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["send-queue-stats", user?.id, broadcastId],
    queryFn: async () => {
      let q = supabase
        .from("broadcast_send_queue")
        .select("status")
        .eq("user_id", user!.id);
      
      if (broadcastId) {
        q = q.eq("broadcast_id", broadcastId);
      }

      const { data, error } = await q;
      if (error) throw error;

      const statuses = (data ?? []).map((d: any) => d.status);
      return {
        total: statuses.length,
        pending: statuses.filter((s: string) => s === "pending").length,
        sent: statuses.filter((s: string) => s === "sent").length,
        failed: statuses.filter((s: string) => s === "failed").length,
        bounced: statuses.filter((s: string) => s === "bounced").length,
        suppressed: statuses.filter((s: string) => s === "suppressed").length,
      };
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  return { stats: query.data, isLoading: query.isLoading };
};

// ── Reputation Score Color ──
export function reputationColor(score: number): string {
  if (score >= 80) return "text-green-700";
  if (score >= 50) return "text-yellow-700";
  return "text-destructive";
}

export function reputationLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Poor";
  return "Critical";
}
