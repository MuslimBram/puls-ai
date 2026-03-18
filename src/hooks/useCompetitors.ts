import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

export interface CompetitorTheme {
  theme: string;
  description: string;
}

export interface CompetitorOpportunity {
  opportunity: string;
  rationale: string;
}

export interface PricingSnapshot {
  has_pricing?: boolean;
  pricing_summary?: string;
  price_points?: string[];
}

export interface PreviousScanData {
  summary?: string;
  pricing?: PricingSnapshot;
  themes?: string[];
  scanned_at?: string;
}

export interface Competitor {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  category: string;
  website_url: string | null;
  social_urls: Record<string, string>;
  is_active: boolean;
  last_scanned_at: string | null;
  scan_frequency: string;
  ai_summary: string | null;
  ai_positioning: string | null;
  ai_content_themes: CompetitorTheme[];
  ai_engagement_style: string | null;
  ai_opportunities: CompetitorOpportunity[];
  pricing_snapshot: PricingSnapshot | null;
  previous_scan_data: PreviousScanData | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitorScan {
  id: string;
  competitor_id: string;
  scan_type: string;
  source_url: string | null;
  content_summary: string | null;
  detected_topics: string[];
  promotion_signals: string[];
  scanned_at: string;
}

export interface CompetitorAlert {
  id: string;
  user_id: string;
  competitor_id: string;
  alert_type: string;
  title: string;
  description: string | null;
  severity: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MarketTrend {
  id: string;
  trend_type: string;
  trend_value: string;
  frequency: number;
  first_seen_at: string;
  last_seen_at: string;
}

const invalidateCompetitorQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ["competitors"] });
  queryClient.invalidateQueries({ queryKey: ["competitor-alerts"] });
  queryClient.invalidateQueries({ queryKey: ["competitor-scans"] });
  queryClient.invalidateQueries({ queryKey: ["market-trends"] });
};

export const useCompetitors = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["competitors", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitors")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Competitor[];
    },
    enabled: !!user,
  });
};

export const useCompetitorScans = (competitorId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["competitor-scans", competitorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_scans")
        .select("*")
        .eq("competitor_id", competitorId!)
        .order("scanned_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as CompetitorScan[];
    },
    enabled: !!user && !!competitorId,
  });
};

export const useMarketTrends = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["market-trends", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_trends")
        .select("*")
        .eq("user_id", user!.id)
        .order("frequency", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as MarketTrend[];
    },
    enabled: !!user,
  });
};

export const useCompetitorAlerts = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["competitor-alerts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_alerts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as CompetitorAlert[];
    },
    enabled: !!user,
  });
};

export const useMarkAlertRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("competitor_alerts")
        .update({ is_read: true } as any)
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor-alerts"] });
    },
  });
};

export const useAddCompetitor = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; website_url?: string; category?: string; social_urls?: Record<string, string> }) => {
      const { data: result, error } = await supabase
        .from("competitors")
        .insert({
          ...data,
          user_id: user!.id,
          workspace_id: workspace?.id || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return result as unknown as Competitor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast({ title: "Competitor added" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};

export const useUpdateCompetitorFrequency = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ competitorId, frequency }: { competitorId: string; frequency: string }) => {
      const { error } = await supabase
        .from("competitors")
        .update({ scan_frequency: frequency } as any)
        .eq("id", competitorId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast({ title: "Frequency updated", description: `Scan frequency set to ${variables.frequency}` });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
};

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
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("competitors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCompetitorQueries(queryClient);
      toast({ title: "Competitor removed" });
    },
  });
};
