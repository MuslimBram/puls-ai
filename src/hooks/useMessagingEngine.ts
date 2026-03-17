import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface ConversationThread {
  id: string;
  user_id: string;
  channel_type: string;
  contact_identifier: string;
  contact_name: string | null;
  subject: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  message_count: number;
  unread_count: number;
  status: string;
  assigned_to: string | null;
  labels: string[];
  created_at: string;
}

export const useConversationThreads = (channelType?: string) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["conversation-threads", user?.id, channelType],
    queryFn: async () => {
      let q = supabase
        .from("conversation_threads")
        .select("*")
        .eq("user_id", user!.id)
        .order("last_message_at", { ascending: false })
        .limit(100);

      if (channelType) q = q.eq("channel_type", channelType);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ConversationThread[];
    },
    enabled: !!user,
  });

  return { threads: query.data ?? [], isLoading: query.isLoading };
};

export const useThreadMessages = (threadId: string | null) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: async () => {
      if (!threadId) return [];
      const { data, error } = await supabase
        .from("inbox_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("message_timestamp", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!threadId,
  });

  return { messages: query.data ?? [], isLoading: query.isLoading };
};

export const useMarkThreadRead = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threadId: string) => {
      await supabase
        .from("conversation_threads")
        .update({ unread_count: 0, updated_at: new Date().toISOString() } as any)
        .eq("id", threadId)
        .eq("user_id", user!.id);

      await supabase
        .from("inbox_messages")
        .update({ is_unread: false } as any)
        .eq("thread_id", threadId)
        .eq("user_id", user!.id)
        .eq("is_unread", true);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversation-threads"] }),
  });
};

export const useUpdateThreadStatus = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId, status }: { threadId: string; status: string }) => {
      const { error } = await supabase
        .from("conversation_threads")
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq("id", threadId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-threads"] });
      toast.success("Thread updated");
    },
  });
};

// Delivery state hooks
export const useMessageDeliveryStates = (inboxMessageId?: string) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["delivery-states", inboxMessageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_delivery_states")
        .select("*")
        .eq("inbox_message_id", inboxMessageId!)
        .order("status_updated_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!inboxMessageId,
  });

  return { states: query.data ?? [], isLoading: query.isLoading };
};

// WhatsApp template hooks
export interface WATemplate {
  id: string;
  template_name: string;
  template_language: string;
  category: string;
  status: string;
  body_text: string;
  header_type: string | null;
  header_content: string | null;
  footer_text: string | null;
  buttons: any[];
  sample_values: Record<string, any>;
  meta_template_id: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
}

export const useWhatsAppTemplates = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["wa-templates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WATemplate[];
    },
    enabled: !!user,
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Partial<WATemplate>) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-template-manager", {
        body: { action: "create", template: { ...template, user_id: user!.id } },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
      toast.success("Template saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const submitTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-template-manager", {
        body: { action: "submit", template_id: templateId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
      toast.success("Template submitted to Meta for approval");
    },
    onError: (e) => toast.error(e.message),
  });

  const syncTemplates = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-template-manager", {
        body: { action: "sync", user_id: user!.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
      toast.success(`Synced ${data?.synced || 0} templates from Meta`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-template-manager", {
        body: { action: "delete", template_id: templateId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
      toast.success("Template deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    createTemplate,
    submitTemplate,
    syncTemplates,
    deleteTemplate,
  };
};
