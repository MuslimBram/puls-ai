import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useUserQuery, useInsertMutation, useUpdateFieldMutation } from "@/hooks/useSupabaseQuery";
import { useToast } from "@/hooks/use-toast";

export interface CompetitorTheme { theme: string; description: string; }
export interface CompetitorOpportunity { opportunity: string; rationale: string; }
export interface PricingSnapshot { has_pricing?: boolean; pricing_summary?: string; price_points?: string[]; }
export interface PreviousScanData { summary?: string; pricing?: PricingSnapshot; themes?: string[]; scanned_at?: string; }

export interface Competitor {
  id: string; user_id: string; workspace_id: string; name: string; category: string;
  website_url: string | null; social_urls: Record<string, string>; is_active: boolean;
  last_scanned_at: string | null; scan_frequency: string; ai_summary: string | null;
  ai_positioning: string | null; ai_content_themes: CompetitorTheme[];
  ai_engagement_style: string | null; ai_opportunities: CompetitorOpportunity[];
  pricing_snapshot: PricingSnapshot | null; previous_scan_data: PreviousScanData | null;
  created_at: string; updated_at: string;
}

export interface CompetitorScan {
  id: string; competitor_id: string; scan_type: string; source_url: string | null;
  content_summary: string | null; detected_topics: string[]; promotion_signals: string[];
  scanned_at: string;
}

export interface CompetitorAlert {
  id: string; user_id: string; workspace_id: string; competitor_id: string; alert_type: string; title: string;
  description: string | null; severity: string; is_read: boolean;
  metadata: Record<string, unknown>; created_at: string;
}

export interface MarketTrend {
  id: string; workspace_id: string; trend_type: string; trend_value: string; frequency: number;
  first_seen_at: string; last_seen_at: string;
}

const invalidateCompetitorQueries = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["competitors"] });
  qc.invalidateQueries({ queryKey: ["competitor-alerts"] });
  qc.invalidateQueries({ queryKey: ["competitor-scans"] });
  qc.invalidateQueries({ queryKey: ["market-trends"] });
};

export const useCompetitors = () =>
  useUserQuery<Competitor>("competitors", "competitors", { workspaceScoped: true });

export const useCompetitorScans = (competitorId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["competitor-scans", competitorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_scans").select("*")
        .eq("competitor_id", competitorId!)
        .order("scanned_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data || []) as unknown as CompetitorScan[];
    },
    enabled: !!user && !!competitorId,
  });
};

// market_trends is owned by parallel R4a1 PR #166; source scoping here is compatible with that boundary.
export const useMarketTrends = () =>
  useUserQuery<MarketTrend>("market_trends", "market-trends", { orderBy: "frequency", limit: 50, workspaceScoped: true });

export const useCompetitorAlerts = () =>
  useUserQuery<CompetitorAlert>("competitor_alerts", "competitor-alerts", { limit: 50, workspaceScoped: true });

export const useMarkAlertRead = () =>
  useUpdateFieldMutation("competitor_alerts", "competitor-alerts", undefined, { workspaceScoped: true });

export const useAddCompetitor = () =>
  useInsertMutation("competitors", "competitors", "Competitor added", { workspaceScoped: true });

export const useUpdateCompetitorFrequency = () =>
  useUpdateFieldMutation("competitors", "competitors", "Frequency updated", { workspaceScoped: true });

export const useAutoAnalyzeCompetitor = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (competitorId: string) => {
      const { data, error } = await supabase.functions.invoke("analyze-competitor", {
        body: { action: "auto_analyze", competitor_id: competitorId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      invalidateCompetitorQueries(queryClient);
      toast({ title: "AI analysis complete", description: "Preliminary insights generated" });
    },
    onError: (e: Error) => toast({ title: "Analysis failed", description: e.message, variant: "destructive" }),
  });
};

export const useScanCompetitor = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (competitorId: string) => {
      const { data, error } = await supabase.functions.invoke("analyze-competitor", {
        body: { action: "scan_competitor", competitor_id: competitorId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      invalidateCompetitorQueries(queryClient);
      toast({ title: "Scan complete", description: `${data.pages_scanned} pages analyzed` });
    },
    onError: (e: Error) => toast({ title: "Scan failed", description: e.message, variant: "destructive" }),
  });
};

export const useScheduledCompetitorScan = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("analyze-competitor", {
        body: { action: "scheduled_scan" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { scanned?: number; alerts_created?: number; total_active?: number; message?: string };
    },
    onSuccess: (data) => {
      invalidateCompetitorQueries(queryClient);
      toast({
        title: "Scheduled scan finished",
        description: data.message ?? `${data.scanned ?? 0} competitors scanned, ${data.alerts_created ?? 0} alerts created`,
      });
    },
    onError: (e: Error) => toast({ title: "Scheduled scan failed", description: e.message, variant: "destructive" }),
  });
};

export const useDeleteCompetitor = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!workspace?.id) throw new Error("Workspace is required");
      const { error } = await supabase.from("competitors").delete().eq("id", id).eq("workspace_id", workspace.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCompetitorQueries(queryClient);
      toast({ title: "Competitor removed" });
    },
  });
};
