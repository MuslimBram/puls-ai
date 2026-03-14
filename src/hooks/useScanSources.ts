import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/hooks/use-toast";

export interface ScanSource {
  id: string;
  workspace_id: string;
  user_id: string;
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
  const qc = useQueryClient();
  const qk = ["scan-sources", workspace?.id];

  const query = useQuery({
    queryKey: qk,
    enabled: !!user && !!workspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scan_sources")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ScanSource[];
    },
  });

  const addSource = useMutation({
    mutationFn: async (input: NewScanSource) => {
      const { error } = await supabase.from("scan_sources").insert({
        user_id: user!.id,
        workspace_id: workspace!.id,
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
      const { error } = await supabase.from("scan_sources").update(updates as any).eq("id", id);
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
      const { error } = await supabase.from("scan_sources").delete().eq("id", id);
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
      // Update source status to scanning
      await supabase.from("scan_sources").update({ scan_status: "scanning" } as any).eq("id", sourceId);

      // Create scan record
      const { data: scanData, error: scanErr } = await supabase.from("source_scans").insert({
        source_id: sourceId,
        user_id: user!.id,
        workspace_id: workspace!.id,
        status: "running",
      } as any).select().single();
      if (scanErr) throw scanErr;

      const scan = scanData as any;

      // Simulate placeholder scan completion after a short delay
      await new Promise((r) => setTimeout(r, 1500));

      // Complete scan
      await supabase.from("source_scans").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        items_found: 0,
      } as any).eq("id", scan.id);

      // Update source
      await supabase.from("scan_sources").update({
        scan_status: "active",
        last_scan_at: new Date().toISOString(),
      } as any).eq("id", sourceId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      toast({ title: "Scan completed", description: "Placeholder scan finished. No real scraping engine yet." });
    },
    onError: async (e: any, sourceId) => {
      await supabase.from("scan_sources").update({ scan_status: "error" } as any).eq("id", sourceId);
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
