import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export const useReplyDrafts = (leadId?: string, inboxMessageId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["reply-drafts", leadId, inboxMessageId],
    queryFn: async () => {
      let q = supabase
        .from("reply_drafts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (leadId) q = q.eq("lead_id", leadId);
      if (inboxMessageId) q = q.eq("inbox_message_id", inboxMessageId);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!(leadId || inboxMessageId),
  });

  const saveDraft = useMutation({
    mutationFn: async (draft: {
      lead_id?: string;
      inbox_message_id?: string;
      tone: string;
      reply_content: string;
      internal_notes?: string;
    }) => {
      const { error } = await supabase.from("reply_drafts").insert({
        ...draft,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reply-drafts"] });
      toast.success("Reply saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const setPreferred = useMutation({
    mutationFn: async (id: string) => {
      if (leadId) {
        await supabase
          .from("reply_drafts")
          .update({ is_preferred: false })
          .eq("lead_id", leadId)
          .eq("user_id", user!.id);
      }
      const { error } = await supabase
        .from("reply_drafts")
        .update({ is_preferred: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reply-drafts"] }),
  });

  const deleteDraft = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reply_drafts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reply-drafts"] });
      toast.success("Draft removed");
    },
  });

  return { drafts: query.data ?? [], isLoading: query.isLoading, saveDraft, setPreferred, deleteDraft };
};

export const useReplyTemplates = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["reply-templates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reply_templates")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addTemplate = useMutation({
    mutationFn: async (tpl: { name: string; content: string; tone: string }) => {
      const { error } = await supabase.from("reply_templates").insert({ ...tpl, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reply-templates"] });
      toast.success("Template saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reply_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reply-templates"] });
      toast.success("Template removed");
    },
  });

  return { templates: query.data ?? [], isLoading: query.isLoading, addTemplate, deleteTemplate };
};

export const useGenerateReply = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useMutation({
    mutationFn: async (params: {
      message: string;
      senderName?: string;
      channelType?: string;
      keywords?: string[];
      tone: string;
      businessId: string;
      workspaceId?: string | null;
      template?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: {
          ...params,
          user_id: user?.id,
          workspace_id: params.workspaceId ?? workspace?.id ?? null,
          business_id: params.businessId,
        },
      });
      if (error) throw error;
      return data as { reply: string };
    },
    onError: (e) => toast.error(e.message),
  });
};
