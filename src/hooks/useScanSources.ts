import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/hooks/use-toast";
import { useActiveBusinessProfile } from "@/hooks/useBusinessProfile";

export interface ScanSource {
  id: string;
  workspace_id: string;
  user_id: string;
  business_id: string | null;
  platform: string;
  source_type: string;
  url_or_identifier: string;
  label: string | null;
  is_active: boolean;
  scan_status: string;
  last_scan_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewScanSource {
  platform: string;
  source_type: string;
  url_or_identifier: string;
  label?: string;
}

const PLATFORMS = ["web", "instagram", "facebook", "telegram", "whatsapp", "linkedin", "other"] as const;
const SOURCE_TYPES = ["website", "page", "profile", "group", "channel", "other"] as const;
const SCAN_STATUSES = ["pending", "active", "scanning", "paused", "error"] as const;

export { PLATFORMS, SOURCE_TYPES, SCAN_STATUSES };

export const useScanSources = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { profile: activeBusiness } = useActiveBusinessProfile();
  const qc = useQueryClient();
  const qk = ["scan-sources", workspace?.id, activeBusiness?.id];

  const query = useQuery({
    queryKey: qk,
    enabled: !!user && !!workspace && !!activeBusiness?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scan_sources")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .eq("business_id", activeBusiness!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ScanSource[];
    },
  });

  const addSource = useMutation({
    mutationFn: async (input: NewScanSource) => {
      if (!activeBusiness?.id) throw new Error("Select a business before adding a scan source.");
      const { error } = await supabase.from("scan_sources").insert({
        user_id: user!.id,
        workspace_id: workspace!.id,
        business_id: activeBusiness.id,
        platform: input.platform,
        source_type: input.source_type,
        url_or_identifier: input.url_or_identifier,
        label: input.label || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      toast({ title: "Source added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateSource = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ScanSource> & { id: string }) => {
      if (!activeBusiness?.id) throw new Error("Select a business before updating a scan source.");
      const { error } = await supabase
        .from("scan_sources")
        .update(updates as any)
        .eq("id", id)
        .eq("business_id", activeBusiness.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      toast({ title: "Source updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSource = useMutation({
    mutationFn: async (id: string) => {
      if (!activeBusiness?.id) throw new Error("Select a business before deleting a scan source.");
      const { error } = await supabase.from("scan_sources").delete().eq("id", id).eq("business_id", activeBusiness.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      toast({ title: "Source deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const triggerScan = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!activeBusiness?.id) throw new Error("Select a business before running a scan.");

      // Update source status to scanning
      await supabase
        .from("scan_sources")
        .update({ scan_status: "scanning" } as any)
        .eq("id", sourceId)
        .eq("business_id", activeBusiness.id);

      // Create scan record
      const { data: scanData, error: scanErr } = await supabase.from("source_scans").insert({
        source_id: sourceId,
        business_id: activeBusiness.id,
        user_id: user!.id,
        workspace_id: workspace!.id,
        status: "running",
        scan_phase: "queued",
      } as any).select().single();
      if (scanErr) throw scanErr;

      const scan = scanData as any;

      // Call extraction edge function
      const { data, error } = await supabase.functions.invoke("scan-source-extract", {
        body: {
          source_id: sourceId,
          scan_id: scan.id,
          workspace_id: workspace!.id,
          business_id: activeBusiness.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk });
      qc.invalidateQueries({ queryKey: ["scan-insights"] });
      qc.invalidateQueries({ queryKey: ["scan-history"] });
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
      qc.invalidateQueries({ queryKey: ["knowledge-chunks"] });
      toast({
        title: "Scan completed",
        description: `Found ${data?.insights_count || 0} insights in ${((data?.duration_ms || 0) / 1000).toFixed(1)}s`,
      });
    },
    onError: async (e: any, sourceId) => {
      if (activeBusiness?.id) {
        await supabase
          .from("scan_sources")
          .update({ scan_status: "error" } as any)
          .eq("id", sourceId)
          .eq("business_id", activeBusiness.id);
      }
      qc.invalidateQueries({ queryKey: qk });
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    },
  });

  return {
    sources: query.data ?? [],
    isLoading: query.isLoading,
    addSource,
    updateSource,
    deleteSource,
    triggerScan,
  };
};
