import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

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
  ai_content_themes: any[];
  ai_engagement_style: string | null;
  ai_opportunities: any[];
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

export interface MarketTrend {
  id: string;
  trend_type: string;
  trend_value: string;
  frequency: number;
  first_seen_at: string;
  last_seen_at: string;
}

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
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      queryClient.invalidateQueries({ queryKey: ["competitor-scans"] });
      queryClient.invalidateQueries({ queryKey: ["market-trends"] });
      toast({ title: "Scan complete", description: `${data.pages_scanned} pages analyzed` });
    },
    onError: (e: Error) => toast({ title: "Scan failed", description: e.message, variant: "destructive" }),
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
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      toast({ title: "Competitor removed" });
    },
  });
};
