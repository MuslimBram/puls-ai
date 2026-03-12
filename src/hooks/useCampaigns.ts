import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

export interface Campaign {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  objective: string;
  target_audience: string | null;
  budget_min: number;
  budget_max: number;
  duration_start: string | null;
  duration_end: string | null;
  preferred_channels: string[];
  status: string;
  positioning_statement: string | null;
  value_proposition: string | null;
  messaging_pillars: any[];
  cta_strategy: string | null;
  funnel_stages: any[];
  audience_personas: any[];
  expected_kpis: Record<string, unknown>;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampaignContent {
  id: string;
  campaign_id: string;
  user_id: string;
  workspace_id: string | null;
  funnel_stage: string;
  content_type: string;
  title: string | null;
  body: string;
  hashtags: string[];
  media_suggestion: string | null;
  status: string;
  content_post_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const useCampaigns = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Campaign[];
    },
    enabled: !!user,
  });
};

export const useCampaignContent = (campaignId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["campaign-content", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_content")
        .select("*")
        .eq("campaign_id", campaignId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CampaignContent[];
    },
    enabled: !!user && !!campaignId,
  });
};

export const useCreateCampaign = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Partial<Campaign>) => {
      const { data: result, error } = await supabase
        .from("campaigns")
        .insert({
          ...data,
          user_id: user!.id,
          workspace_id: workspace?.id || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return result as unknown as Campaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Campaign created" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to create campaign", description: e.message, variant: "destructive" });
    },
  });
};

export const useGenerateCampaignStrategy = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ campaignId, campaignData }: { campaignId: string; campaignData: Partial<Campaign> }) => {
      const { data, error } = await supabase.functions.invoke("generate-campaign", {
        body: {
          action: "generate_strategy",
          campaign_id: campaignId,
          campaign_data: { ...campaignData, workspace_id: workspace?.id || null },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-content"] });
      toast({ title: "Strategy generated", description: "AI campaign strategy and content created." });
    },
    onError: (e: Error) => {
      toast({ title: "Strategy generation failed", description: e.message, variant: "destructive" });
    },
  });
};

export const useUpdateCampaign = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Campaign> }) => {
      const { error } = await supabase
        .from("campaigns")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
};

export const useDeleteCampaign = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });
};
