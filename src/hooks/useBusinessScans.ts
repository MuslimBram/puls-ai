import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface ScanAutomationSummary {
  status?: "queued" | "processing" | "completed" | "retrying" | "failed";
  profile_sync?: "pending" | "processing" | "completed" | "failed";
  knowledge_sync?: "pending" | "processing" | "completed" | "failed";
  queued_at?: string;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  last_error_at?: string;
  error?: string | null;
  job_type?: string;
  knowledge_source_id?: string;
  knowledge_source_name?: string;
  knowledge_chunks_created?: number;
  updated_fields?: string[];
}

export interface BusinessScanSummary {
  business_summary?: string;
  industry?: string;
  target_audience?: string;
  unique_selling_points?: string[];
  automation?: ScanAutomationSummary;
  [key: string]: unknown;
}

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
  summary_json: BusinessScanSummary | null;
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

type AtomicScanRequest = {
  scan_history_id: string;
  source_id: string;
  source_scan_id: string;
  workspace_id: string;
  business_id: string;
  scanned_url: string;
};

export const useBusinessScanHistory = (businessId?: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["business-scan-history", businessId],
    enabled: !!user && !!businessId,
    refetchInterval: 5000,
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
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ businessId, workspaceId, url }: { businessId: string; workspaceId: string; url: string }) => {
      const normalizedUrl = url.trim();
      if (!normalizedUrl) throw new Error("Website URL is required");

      // One caller-bound database transaction creates the source, history row,
      // and source-scan. workspaceId is retained only as a UI consistency hint;
      // tenant authority is resolved from businessId on the server.
      const { data: requestRows, error: requestError } = await (supabase as any).rpc("create_business_scan_request", {
        p_business_id: businessId,
        p_scanned_url: normalizedUrl,
      });
      if (requestError) throw requestError;

      const request = (Array.isArray(requestRows) ? requestRows[0] : requestRows) as AtomicScanRequest | null;
      if (!request?.scan_history_id || !request.source_id || !request.source_scan_id || !request.workspace_id) {
        throw new Error("Atomic business scan request was not created");
      }
      if (workspaceId && request.workspace_id !== workspaceId) {
        throw new Error("Workspace mismatch for server-derived scan authority");
      }

      const { data, error } = await supabase.functions.invoke("business-scan-extract", {
        body: {
          business_id: request.business_id,
          scan_history_id: request.scan_history_id,
          source_id: request.source_id,
          source_scan_id: request.source_scan_id,
          workspace_id: request.workspace_id,
          url: request.scanned_url,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["business-scan-history", variables.businessId] });
      qc.invalidateQueries({ queryKey: ["business-profile"] });
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
      qc.invalidateQueries({ queryKey: ["knowledge-chunks"] });
      qc.invalidateQueries({ queryKey: ["scan-insights"] });
      qc.invalidateQueries({ queryKey: ["scan-history"] });
      qc.invalidateQueries({ queryKey: ["scan-sources"] });
      toast({
        title: "Scan completed",
        description: `Found ${data?.insights_count || 0} insights in ${((data?.duration_ms || 0) / 1000).toFixed(1)}s`,
      });
    },
    onError: (e: any, variables) => {
      qc.invalidateQueries({ queryKey: ["business-scan-history", variables.businessId] });
      qc.invalidateQueries({ queryKey: ["scan-insights"] });
      qc.invalidateQueries({ queryKey: ["scan-history"] });
      qc.invalidateQueries({ queryKey: ["scan-sources"] });
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
        body: { business_id: businessId, scan_history_id: scanHistoryId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        source_id: string;
        source_name: string;
        canonical_items: number;
        chunks_created: number;
      };
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["business-scan-history", variables.businessId] });
      qc.invalidateQueries({ queryKey: ["business-profile"] });
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
      qc.invalidateQueries({ queryKey: ["knowledge-chunks"] });
      toast({
        title: "Canonical knowledge verified",
        description: `${data.canonical_items} security-approved knowledge items are available to Pulse AI.`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Knowledge verification failed", description: e.message, variant: "destructive" });
    },
  });
};
