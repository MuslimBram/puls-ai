import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface MarketingCampaign {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  campaign_type: string;
  channels: string[];
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  target_audience: any;
  content_config: any;
  performance: any;
  created_at: string;
}

export interface ContentItem {
  id: string;
  content_type: string;
  title: string | null;
  body: string;
  tone: string;
  channel: string | null;
  status: string;
  performance_score: number | null;
  created_at: string;
}

export const useMarketingCampaigns = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing-campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MarketingCampaign[];
    },
    enabled: !!user,
  });
};

export const useCreateMarketingCampaign = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useMutation({
    mutationFn: async (campaign: { name: string; channels: string[]; scheduled_at?: string }) => {
      const { error } = await supabase
        .from("marketing_campaigns")
        .insert({
          user_id: user!.id,
          workspace_id: workspace?.id,
          ...campaign,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      toast.success("Campaign created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useContentLibrary = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["content-library", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_content_library")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as ContentItem[];
    },
    enabled: !!user,
  });
};

export const useGenerateContent = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useMutation({
    mutationFn: async (config: { content_type: string; tone: string; channel: string; body: string }) => {
      const { error } = await supabase
        .from("ai_content_library")
        .insert({
          user_id: user!.id,
          workspace_id: workspace?.id,
          ...config,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-library"] });
      toast.success("Content saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useMarketingAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing-analytics", user?.id],
    queryFn: async () => {
      const { data: campaigns } = await supabase
        .from("marketing_campaigns")
        .select("status, channels, performance")
        .eq("user_id", user!.id);

      const total = (campaigns || []).length;
      const active = (campaigns || []).filter((c: any) => c.status === "active").length;
      const completed = (campaigns || []).filter((c: any) => c.status === "completed").length;

      const channelReach: Record<string, number> = {};
      for (const c of campaigns || []) {
        for (const ch of (c as any).channels || []) {
          channelReach[ch] = (channelReach[ch] || 0) + 1;
        }
      }

      return { total, active, completed, channelReach };
    },
    enabled: !!user,
  });
};
