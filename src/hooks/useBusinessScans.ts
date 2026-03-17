import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface BusinessScanHistory {
  id: string;
  business_id: string;
  workspace_id: string;
  triggered_by: string;
  scanned_url: string;
  status: string;
  scan_phase: string;
  pages_scanned: number;
  insights_count: number;
  duration_ms: number | null;
  error_message: string | null;
  summary_json: Record<string, unknown>;
  products_found: Array<{ title: string; description: string; pricing_signal?: string }>;
  services_found: Array<{ title: string; description: string }>;
  contact_methods: Array<{ type: string; value: string }>;
  social_links: Record<string, string[]>;
  pricing_signals: Array<{ signal: string }>;
  tone_of_voice: string | null;
  suggested_keywords: string[];
  cta_signals: Array<{ cta: string }>;
  competitor_hints: Array<{ name: string; url?: string }>;
  created_at: string;
  completed_at: string | null;
}

export interface BusinessAIContent {
  id: string;
  business_id: string;
  scan_history_id: string | null;
  workspace_id: string;
  generated_by: string;
  content_type: string;
  content_json: Record<string, unknown>;
  status: string;
  created_at: string;
}

export const useBusinessScanHistory = (businessId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["business-scan-history", businessId],
    enabled: !!user && !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_scan_history")
        .select("*")
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as BusinessScanHistory[];
    },
  });
};

export const useBusinessAIContent = (businessId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["business-ai-content", businessId],
    enabled: !!user && !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_ai_content")
        .select("*")
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as BusinessAIContent[];
    },
  });
};

export const useTriggerBusinessScan = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ businessId, workspaceId, url }: { businessId: string; workspaceId: string; url: string }) => {
      const normalizedUrl = url.trim();

      const { data: scanRecord, error: insertErr } = await supabase
        .from("business_scan_history")
        .insert({
          business_id: businessId,
          workspace_id: workspaceId,
          triggered_by: user!.id,
          scanned_url: normalizedUrl,
          status: "scanning",
          scan_phase: "queued",
        } as any)
        .select()
        .single();
      if (insertErr) throw insertErr;

      const scan = scanRecord as unknown as BusinessScanHistory;

      const { data: existingSource, error: sourceLookupError } = await supabase
        .from("scan_sources")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("business_id", businessId)
        .eq("url_or_identifier", normalizedUrl)
        .maybeSingle();
      if (sourceLookupError) throw sourceLookupError;

      let sourceId = existingSource?.id as string | undefined;

      if (!sourceId) {
        const { data: createdSource, error: createSourceError } = await supabase
          .from("scan_sources")
          .insert({
            user_id: user!.id,
            workspace_id: workspaceId,
            business_id: businessId,
            platform: "web",
            source_type: "website",
            url_or_identifier: normalizedUrl,
            label: normalizedUrl,
            is_active: true,
            scan_status: "scanning",
          } as any)
          .select("id")
          .single();

        if (createSourceError) throw createSourceError;
        sourceId = createdSource.id;
      } else {
        const { error: updateSourceError } = await supabase
          .from("scan_sources")
          .update({ scan_status: "scanning", business_id: businessId } as any)
          .eq("id", sourceId);
        if (updateSourceError) throw updateSourceError;
      }

      const { data: sourceScanRecord, error: sourceScanError } = await supabase
        .from("source_scans")
        .insert({
          source_id: sourceId,
          business_id: businessId,
          user_id: user!.id,
          workspace_id: workspaceId,
          status: "running",
          scan_phase: "queued",
          items_found: 0,
          insights_found: 0,
          pages_scanned: 0,
        } as any)
        .select("id")
        .single();
      if (sourceScanError) throw sourceScanError;

      const { data, error } = await supabase.functions.invoke("business-scan-extract", {
        body: {
          business_id: businessId,
          scan_history_id: scan.id,
          source_id: sourceId,
          source_scan_id: sourceScanRecord.id,
          workspace_id: workspaceId,
          url: normalizedUrl,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["business-scan-history", variables.businessId] });
      qc.invalidateQueries({ queryKey: ["scan-insights"] });
      qc.invalidateQueries({ queryKey: ["scan-history"] });
      qc.invalidateQueries({ queryKey: ["scan-sources"] });
      toast({
        title: "Scan completed",
        description: `Found ${data?.insights_count || 0} insights in ${((data?.duration_ms || 0) / 1000).toFixed(1)}s`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    },
  });
};

export const useGenerateBusinessContent = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ businessId, workspaceId, scanHistoryId }: { businessId: string; workspaceId: string; scanHistoryId?: string }) => {
      const { data, error } = await supabase.functions.invoke("generate-business-content", {
        body: {
          business_id: businessId,
          workspace_id: workspaceId,
          scan_history_id: scanHistoryId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["business-ai-content", variables.businessId] });
      toast({ title: "Content generated successfully" });
    },
    onError: (e: any) => {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    },
  });
};

export const useSaveBusinessScanToKnowledgeBase = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ businessId, scanHistoryId }: { businessId: string; scanHistoryId: string }) => {
      const { data, error } = await supabase.functions.invoke("save-scan-to-knowledge-base", {
        body: {
          business_id: businessId,
          scan_history_id: scanHistoryId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { source_id: string; chunks_created: number; source_name: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
      qc.invalidateQueries({ queryKey: ["knowledge-chunks"] });
      toast({
        title: "Saved to Knowledge Base",
        description: `${data.chunks_created} chunks saved for AI usage.`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Knowledge save failed", description: e.message, variant: "destructive" });
    },
  });
};
