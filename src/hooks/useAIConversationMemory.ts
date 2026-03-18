import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useActiveBusinessProfile } from "@/hooks/useBusinessProfile";
import { toast } from "@/components/ui/sonner";

export interface ConversationMemory {
  id: string;
  workspace_id: string;
  business_id?: string | null;
  contact_identifier: string;
  contact_name: string | null;
  memory_type: string;
  summary: string | null;
  key_facts: string[] | null;
  sentiment_trend: string | null;
  last_interaction_at: string | null;
  interaction_count: number | null;
  created_at: string;
  updated_at: string;
}

export const useContactMemory = (contactIdentifier?: string, businessId?: string) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { profile: activeBusiness } = useActiveBusinessProfile();
  const resolvedBusinessId = businessId ?? activeBusiness?.id;

  return useQuery({
    queryKey: ["ai-memory", workspace?.id, resolvedBusinessId, contactIdentifier],
    queryFn: async () => {
      let query = supabase
        .from("ai_conversation_memory")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .eq("contact_identifier", contactIdentifier!)
        .eq("memory_type", "conversation");

      if (resolvedBusinessId) {
        query = query.eq("business_id", resolvedBusinessId);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as ConversationMemory | null;
    },
    enabled: !!user && !!workspace?.id && !!contactIdentifier && !!resolvedBusinessId,
  });
};

export const useRefreshMemory = () => {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useMutation({
    mutationFn: async ({
      contactIdentifier,
      newMessage,
      channelType,
      businessId,
    }: {
      contactIdentifier: string;
      newMessage?: string;
      channelType?: string;
      businessId?: string;
    }) => {
      const resolvedBusinessId = businessId ?? activeBusiness?.id;
      if (!workspace?.id || !resolvedBusinessId) {
        throw new Error("Select a business before refreshing AI memory.");
      }

      const { data, error } = await supabase.functions.invoke("ai-conversation-memory", {
        body: {
          workspace_id: workspace.id,
          business_id: resolvedBusinessId,
          contact_identifier: contactIdentifier,
          new_message: newMessage,
          channel_type: channelType,
        },
      });
      if (error) throw error;
      return data as {
        memory: ConversationMemory;
        suggested_reply: string;
        deal_suggestion: string | null;
        sentiment: string;
      };
    },
    onSuccess: (_, vars) => {
      const resolvedBusinessId = vars.businessId ?? activeBusiness?.id;
      qc.invalidateQueries({ queryKey: ["ai-memory", workspace?.id, resolvedBusinessId, vars.contactIdentifier] });
      toast.success("AI memory updated");
    },
    onError: (e) => toast.error(e.message),
  });
};

export const useLeadScore = (leadId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["lead-score", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_scores")
        .select("*")
        .eq("lead_id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!leadId,
  });
};

export const useScoreLeads = () => {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("score-leads", {
        body: { workspace_id: workspace!.id },
      });
      if (error) throw error;
      return data as { scored: number; total: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["lead-score"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Scored ${data.scored} of ${data.total} leads`);
    },
    onError: (e) => toast.error(e.message),
  });
};
