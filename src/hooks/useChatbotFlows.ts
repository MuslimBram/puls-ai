import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface ChatbotQuestion {
  id: string;
  text: string;
  type: "text" | "select" | "number" | "email" | "phone";
  options?: string[];
  required: boolean;
  score_weight: number;
}

export interface ChatbotFlow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  target_pipeline_stage_id: string | null;
  welcome_message: string;
  completion_message: string;
  questions: ChatbotQuestion[];
  scoring_rules: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatbotSession {
  id: string;
  flow_id: string;
  user_id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  responses: Array<{ question_id: string; answer: string }>;
  quality_score: number;
  ai_summary: string | null;
  status: string;
  deal_id: string | null;
  lead_id: string | null;
  channel_type: string;
  completed_at: string | null;
  created_at: string;
}

export const useChatbotFlows = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["chatbot-flows", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbot_flows")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ChatbotFlow[];
    },
    enabled: !!user,
  });

  const createFlow = useMutation({
    mutationFn: async (flow: Partial<ChatbotFlow>) => {
      const { data, error } = await supabase
        .from("chatbot_flows")
        .insert({ ...flow, user_id: user!.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ChatbotFlow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
      toast.success("Chatbot flow created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateFlow = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChatbotFlow> & { id: string }) => {
      const { error } = await supabase
        .from("chatbot_flows")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
      toast.success("Flow updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteFlow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chatbot_flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
      toast.success("Flow deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("chatbot_flows")
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] }),
  });

  return { flows: query.data ?? [], isLoading: query.isLoading, createFlow, updateFlow, deleteFlow, toggleActive };
};

export const useChatbotSessions = (flowId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["chatbot-sessions", user?.id, flowId],
    queryFn: async () => {
      let q = supabase
        .from("chatbot_sessions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (flowId) q = q.eq("flow_id", flowId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ChatbotSession[];
    },
    enabled: !!user,
  });
};
