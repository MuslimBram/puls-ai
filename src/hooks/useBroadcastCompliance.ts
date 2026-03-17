import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

// Spam scoring: checks message content for spam signals
export function computeSpamScore(content: string, subject?: string | null): number {
  let score = 0;
  const text = `${subject || ""} ${content}`.toLowerCase();

  const spamWords = ["free", "winner", "congratulations", "act now", "limited time", "click here", "buy now", "discount", "offer expires", "no obligation", "risk free", "guaranteed"];
  const capsRatio = (text.match(/[A-Z]/g)?.length || 0) / Math.max(text.length, 1);

  for (const word of spamWords) {
    if (text.includes(word)) score += 8;
  }
  if (capsRatio > 0.4) score += 15;
  if (text.includes("!!!") || text.includes("???")) score += 10;
  if ((text.match(/https?:\/\//g)?.length || 0) > 3) score += 12;
  if (!text.includes("unsubscribe") && !text.includes("opt-out") && !text.includes("opt out")) score += 15;

  return Math.min(score, 100);
}

// Channel-specific sending limits
export const CHANNEL_LIMITS: Record<string, { maxPerDay: number; maxPerMinute: number; requiresApproval: boolean }> = {
  email: { maxPerDay: 5000, maxPerMinute: 100, requiresApproval: false },
  sms: { maxPerDay: 1000, maxPerMinute: 30, requiresApproval: true },
  whatsapp: { maxPerDay: 1000, maxPerMinute: 60, requiresApproval: true },
  telegram: { maxPerDay: 3000, maxPerMinute: 30, requiresApproval: false },
};

export const useOptouts = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["broadcast-optouts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcast_optouts")
        .select("*")
        .eq("user_id", user!.id)
        .order("opted_out_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  return { optouts: query.data ?? [], isLoading: query.isLoading };
};

export const useCheckOptout = () => {
  const { user } = useAuth();

  return async (contactIdentifier: string, channelType: string): Promise<boolean> => {
    if (!user) return true;
    const { data } = await supabase
      .from("broadcast_optouts")
      .select("id")
      .eq("user_id", user.id)
      .eq("contact_identifier", contactIdentifier)
      .in("channel_type", [channelType, "all"])
      .maybeSingle();
    return !!data;
  };
};

export const useApproveBroadcast = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ broadcastId, approved, notes }: { broadcastId: string; approved: boolean; notes?: string }) => {
      const { error } = await supabase
        .from("broadcasts")
        .update({
          approval_status: approved ? "approved" : "rejected",
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
          compliance_notes: notes || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", broadcastId);
      if (error) throw error;
    },
    onSuccess: (_, { approved }) => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success(approved ? "Broadcast approved" : "Broadcast rejected");
    },
    onError: (e) => toast.error(e.message),
  });
};
