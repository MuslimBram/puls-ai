import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useActiveBusinessProfile } from "@/hooks/useBusinessProfile";

export interface KnowledgeSource {
  id: string;
  user_id: string;
  business_id: string | null;
  source_type: string;
  source_name: string;
  source_url: string | null;
  status: string;
  last_scanned_at: string | null;
  scan_frequency: string;
  is_enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: string;
  user_id: string;
  business_id: string | null;
  source_id: string;
  content: string;
  summary: string | null;
  topic_tags: string[];
  content_type: string;
  page_url: string | null;
  page_title: string | null;
  chunk_index: number;
  word_count: number;
  created_at: string;
}

export const useKnowledgeSources = () => {
  const { user } = useAuth();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useQuery({
    queryKey: ["knowledge-sources", user?.id, activeBusiness?.id],
    queryFn: async () => {
      let query = supabase
        .from("knowledge_sources")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (activeBusiness?.id) {
        query = query.eq("business_id", activeBusiness.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as KnowledgeSource[];
    },
    enabled: !!user && !!activeBusiness?.id,
  });
};

export const useKnowledgeChunks = (sourceId?: string) => {
  const { user } = useAuth();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useQuery({
    queryKey: ["knowledge-chunks", user?.id, activeBusiness?.id, sourceId],
    queryFn: async () => {
      let query = supabase
        .from("knowledge_chunks")
        .select("*")
        .eq("user_id", user!.id)
        .eq("business_id", activeBusiness!.id)
        .order("chunk_index", { ascending: true });

      if (sourceId) query = query.eq("source_id", sourceId);

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as unknown as KnowledgeChunk[];
    },
    enabled: !!user && !!activeBusiness?.id,
  });
};

export const useIngestWebsite = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useMutation({
    mutationFn: async (params: { url: string; source_id?: string; crawl_depth?: number }) => {
      if (!activeBusiness?.id) throw new Error("Select a business before ingesting website data.");
      const { data, error } = await supabase.functions.invoke("ingest-website", {
        body: { ...params, business_id: activeBusiness.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-chunks"] });
      toast({
        title: "Website ingested",
        description: `${data.pages_crawled} pages crawled, ${data.chunks_created} knowledge chunks created.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Ingestion failed", description: error.message, variant: "destructive" });
    },
  });
};

export const useIngestDocument = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useMutation({
    mutationFn: async (params: { file_path?: string; file_name: string; content_text?: string }) => {
      if (!activeBusiness?.id) throw new Error("Select a business before ingesting documents.");
      const { data, error } = await supabase.functions.invoke("ingest-document", {
        body: { ...params, business_id: activeBusiness.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-chunks"] });
      toast({
        title: "Document ingested",
        description: `${data.chunks_created} knowledge chunks created.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Document ingestion failed", description: error.message, variant: "destructive" });
    },
  });
};

export const useSearchKnowledge = () => {
  const { toast } = useToast();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useMutation({
    mutationFn: async (params: { query: string; topic_filter?: string; source_type?: string }) => {
      if (!activeBusiness?.id) throw new Error("Select a business before searching knowledge.");
      const { data, error } = await supabase.functions.invoke("search-knowledge", {
        body: { ...params, business_id: activeBusiness.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onError: (error: Error) => {
      toast({ title: "Search failed", description: error.message, variant: "destructive" });
    },
  });
};

export const useDeleteSource = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      let query = supabase.from("knowledge_sources").delete().eq("id", sourceId);
      if (activeBusiness?.id) {
        query = query.eq("business_id", activeBusiness.id);
      }
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-chunks"] });
      toast({ title: "Source deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });
};

export const useToggleSource = () => {
  const queryClient = useQueryClient();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      let query = supabase
        .from("knowledge_sources")
        .update({ is_enabled } as Record<string, unknown>)
        .eq("id", id);

      if (activeBusiness?.id) {
        query = query.eq("business_id", activeBusiness.id);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources"] });
    },
  });
};

export const useUploadDocument = () => {
  const { user } = useAuth();
  const ingestMutation = useIngestDocument();
  const { toast } = useToast();
  const { profile: activeBusiness } = useActiveBusinessProfile();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not authenticated");
      if (!activeBusiness?.id) throw new Error("Select a business before uploading documents.");

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const allowedExts = ["txt", "md", "csv", "json"];

      if (allowedExts.includes(ext)) {
        const text = await file.text();
        return ingestMutation.mutateAsync({ file_name: file.name, content_text: text });
      }

      const filePath = `${user.id}/${activeBusiness.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("knowledge-documents")
        .upload(filePath, file);

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      return ingestMutation.mutateAsync({ file_path: filePath, file_name: file.name });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });
};
