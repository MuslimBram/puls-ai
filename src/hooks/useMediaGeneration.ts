import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useToast } from "@/hooks/use-toast";

export interface MediaGeneration {
  id: string;
  workspace_id: string;
  user_id: string;
  media_type: string;
  duration_seconds: number | null;
  prompt: string | null;
  result_url: string | null;
  status: string;
  created_at: string;
}

export interface MediaUsageStatus {
  imagesUsed: number;
  imagesLimit: number;
  videosUsed: number;
  videosLimit: number;
  videoMaxSeconds: number;
  imagesRemaining: number;
  videosRemaining: number;
  addonImagesRemaining: number;
  addonVideosRemaining: number;
}

export const useMediaUsage = () => {
  const { subscription, plan } = useFeatureGating();

  const imagesUsed = (subscription as any)?.images_generated_this_month || 0;
  const videosUsed = (subscription as any)?.videos_generated_this_month || 0;
  const imagesLimit = plan.limits.imagesPerMonth;
  const videosLimit = plan.limits.videosPerMonth;
  const videoMaxSeconds = plan.limits.videoMaxSeconds;

  return {
    imagesUsed,
    imagesLimit,
    videosUsed,
    videosLimit,
    videoMaxSeconds,
    imagesRemaining: imagesLimit === -1 ? Infinity : Math.max(0, imagesLimit - imagesUsed),
    videosRemaining: videosLimit === -1 ? Infinity : Math.max(0, videosLimit - videosUsed),
    isImageLimitReached: imagesLimit !== -1 && imagesUsed >= imagesLimit,
    isVideoLimitReached: videosLimit !== -1 && videosUsed >= videosLimit,
    canGenerateImages: plan.features.mediaGeneration || imagesLimit > 0,
    canGenerateVideos: plan.features.mediaGeneration && videosLimit !== 0,
  };
};

export const useMediaGenerations = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey: ["media-generations", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_generations")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as MediaGeneration[];
    },
    enabled: !!user && !!workspace,
  });
};

export const useCreateMediaGeneration = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      mediaType,
      prompt,
      durationSeconds,
    }: {
      mediaType: "image" | "video";
      prompt: string;
      durationSeconds?: number;
    }) => {
      const { error } = await supabase.from("media_generations").insert({
        workspace_id: workspace!.id,
        user_id: user!.id,
        media_type: mediaType,
        prompt,
        duration_seconds: durationSeconds || null,
        status: "pending",
      } as any);
      if (error) throw error;

      // Increment usage counter
      const field = mediaType === "image" ? "images_generated_this_month" : "videos_generated_this_month";
      const { data: sub } = await supabase
        .from("subscriptions")
        .select(field)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (sub) {
        const current = Number((sub as any)[field]) || 0;
        await supabase
          .from("subscriptions")
          .update({ [field]: current + 1 } as any)
          .eq("user_id", user!.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-generations"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      toast({ title: "Generation queued", description: "Your media generation has been submitted." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};

export const useMediaAddons = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey: ["media-addons", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_addons")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .gt("remaining", 0)
        .order("purchased_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!workspace,
  });
};
