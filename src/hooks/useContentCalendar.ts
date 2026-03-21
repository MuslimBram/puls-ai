import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useUserQuery, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";

export interface ContentPost {
  id: string;
  user_id: string;
  title: string | null;
  caption: string;
  hashtags: string[];
  cta: string | null;
  media_type: string;
  content_type: string;
  target_networks: string[];
  status: string;
  scheduled_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  engagement_metrics: Record<string, unknown>;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentIdea {
  id: string;
  idea_text: string;
  content_type: string;
  suggested_media: string | null;
  is_used: boolean;
  created_at: string;
}

export const useContentPosts = (statusFilter?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["content-posts", user?.id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("content_posts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ContentPost[];
    },
    enabled: !!user,
  });
};

export const useContentIdeas = () =>
  useUserQuery<ContentIdea>("content_ideas", "content-ideas", {
    filters: { is_used: false },
    limit: 20,
  });

export const useContentKnowledge = () =>
  useUserQuery("content_knowledge", "content-knowledge", {
    orderBy: "scanned_at",
  });

export const useScanWebsite = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (url: string) => {
      const { data, error } = await supabase.functions.invoke("scan-business-content", {
        body: { url },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data: { warning?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["content-knowledge"] });
      if (data?.warning) {
        toast({ title: "Source saved", description: data.warning });
        return;
      }
      toast({ title: "Website scanned", description: "Content knowledge base updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Scan failed", description: error.message, variant: "destructive" });
    },
  });
};

export const useGenerateContent = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { content_type: string; count?: number; custom_prompt?: string }) => {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["content-posts"] });
      queryClient.invalidateQueries({ queryKey: ["content-ideas"] });
      toast({ title: "Content generated", description: `${data.posts?.length || 0} posts created as drafts.` });
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });
};

export const useUpdatePost = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ContentPost> }) => {
      const { data, error } = await supabase
        .from("content_posts")
        .update(updates as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-posts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });
};

export const useDeletePost = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-posts"] });
      toast({ title: "Post deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });
};
