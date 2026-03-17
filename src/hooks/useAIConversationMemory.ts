import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface ConversationMemory {
  id: string;
  workspace_id: string;
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

export const useContactMemory = (contactIdentifier?: string) => {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();

  return useQuery({
    queryKey: ["ai-memory", currentWorkspace?.id, contactIdentifier],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_conversation_memory")
        .select("*")
        .eq("workspace_id", currentWorkspace!.id)
        .eq("contact_identifier", contactIdentifier!)
        .eq("memory_type", "conversation")
        .maybeSingle();
      if (error) throw error;
      return data as ConversationMemory | null;
    },
    enabled: !!user && !!currentWorkspace?.id && !!contactIdentifier,
  });
};

export const useRefreshMemory = () => {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();

  return useMutation({
    mutationFn: async ({
      contactIdentifier,
      newMessage,
      channelType,
    }: {
      contactIdentifier: string;
      newMessage?: string;
      channelType?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("ai-conversation-memory", {
        body: {
          workspace_id: currentWorkspace!.id,
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
      qc.invalidateQueries({ queryKey: ["ai-memory", currentWorkspace?.id, vars.contactIdentifier] });
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
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("score-leads", {
        body: { workspace_id: currentWorkspace!.id },
      });
      if (error) throw error;
      return data as { scored: number; total: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["lead-score"] });
      toast.success(`Scored ${data.scored} of ${data.total} leads`);
    },
    onError: (e) => toast.error(e.message),
  });
};
