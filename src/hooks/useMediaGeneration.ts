import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { normalizeMediaDailyUsage, resolveCatalogMediaPolicy } from "@/lib/mediaPolicy";
import { useToast } from "@/hooks/use-toast";

export type MediaGeneration = Database["public"]["Tables"]["media_generations"]["Row"];
export type MediaGenerationRecord = MediaGeneration & { business_id?: string | null };
type MediaUsageEvent = Database["public"]["Tables"]["media_usage_events"]["Row"];
type ActiveBusiness = Pick<Database["public"]["Tables"]["business_profiles"]["Row"], "id" | "business_name" | "workspace_id">;

export interface MediaUsageStatus {
  planKey: string;
  imagesUsedToday: number;
  imagesLimit: number;
  videosUsedToday: number;
  videosLimit: number;
  videoMaxSeconds: number;
  imagesRemaining: number;
  videosRemaining: number;
  resetsAt: string | null;
  isImageLimitReached: boolean;
  isVideoLimitReached: boolean;
  canGenerateImages: boolean;
  canGenerateVideos: boolean;
  isLoading: boolean;
}

export interface MediaUsageAnalytics {
  totalRequests: number;
  totalCompleted: number;
  totalFailed: number;
  imageCompleted: number;
  videoCompleted: number;
  activeJobs: number;
}

export const useActiveBusinessProfile = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey: ["active-business-profile", user?.id, workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("id, business_name, workspace_id")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as ActiveBusiness | null;
    },
    enabled: !!user && !!workspace,
  });
};

export const useMediaUsage = (): MediaUsageStatus => {
  const { user } = useAuth();
  const { currentPlanKey } = useFeatureGating();
  const { plansByKey, defaultPlanKey, isLoading: catalogLoading } = useMonetizationCatalog();

  const activePlan = plansByKey[currentPlanKey] ?? plansByKey[defaultPlanKey] ?? null;
  const mediaPolicy = useMemo(() => resolveCatalogMediaPolicy(activePlan), [activePlan]);

  const query = useQuery({
    queryKey: ["media-usage", user?.id, mediaPolicy?.planKey],
    queryFn: async () => {
      if (!mediaPolicy) {
        throw new Error("Media pricing policy unavailable");
      }

      const { data, error } = await supabase
        .from("media_usage_daily")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) throw error;

      const normalizedDaily = normalizeMediaDailyUsage(data, mediaPolicy);
      const imagesLimit = normalizedDaily.image_limit;
      const videosLimit = normalizedDaily.video_limit;
      const imagesRemaining = imagesLimit === -1 ? Number.POSITIVE_INFINITY : Math.max(0, imagesLimit - normalizedDaily.image_count);
      const videosRemaining = videosLimit === -1 ? Number.POSITIVE_INFINITY : Math.max(0, videosLimit - normalizedDaily.video_count);

      return {
        planKey: mediaPolicy.planKey,
        imagesUsedToday: normalizedDaily.image_count,
        imagesLimit,
        videosUsedToday: normalizedDaily.video_count,
        videosLimit,
        videoMaxSeconds: mediaPolicy.max_video_seconds,
        imagesRemaining,
        videosRemaining,
        resetsAt: normalizedDaily.window_ends_at,
        isImageLimitReached: imagesLimit !== -1 && normalizedDaily.image_count >= imagesLimit,
        isVideoLimitReached: videosLimit !== -1 && normalizedDaily.video_count >= videosLimit,
        canGenerateImages: mediaPolicy.allow_image_generation && (imagesLimit === -1 || normalizedDaily.image_count < imagesLimit),
        canGenerateVideos: mediaPolicy.allow_video_generation && (videosLimit === -1 || normalizedDaily.video_count < videosLimit),
      };
    },
    enabled: !!user && !!mediaPolicy,
    refetchInterval: 30000,
  });

  if (query.data) {
    return {
      ...query.data,
      isLoading: query.isLoading || catalogLoading,
    };
  }

  const imagesLimit = mediaPolicy?.daily_image_limit ?? 0;
  const videosLimit = mediaPolicy?.daily_video_limit ?? 0;

  return {
    planKey: mediaPolicy?.planKey ?? currentPlanKey,
    imagesUsedToday: 0,
    imagesLimit,
    videosUsedToday: 0,
    videosLimit,
    videoMaxSeconds: mediaPolicy?.max_video_seconds ?? 0,
    imagesRemaining: imagesLimit === -1 ? Number.POSITIVE_INFINITY : Math.max(0, imagesLimit),
    videosRemaining: videosLimit === -1 ? Number.POSITIVE_INFINITY : Math.max(0, videosLimit),
    resetsAt: null,
    isImageLimitReached: imagesLimit === 0,
    isVideoLimitReached: videosLimit === 0,
    canGenerateImages: Boolean(mediaPolicy?.allow_image_generation) && imagesLimit !== 0,
    canGenerateVideos: Boolean(mediaPolicy?.allow_video_generation) && videosLimit !== 0,
    isLoading: query.isLoading || catalogLoading,
  };
};

export const useMediaGenerations = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { data: activeBusiness, isLoading: businessLoading } = useActiveBusinessProfile();

  return useQuery({
    queryKey: ["media-generations", workspace?.id, activeBusiness?.id],
    queryFn: async () => {
      let query = supabase
        .from("media_generations")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (activeBusiness?.id) {
        query = query.eq("business_id", activeBusiness.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as MediaGeneration[];
    },
    enabled: !!user && !!workspace && !businessLoading,
    refetchInterval: (query) => {
      const items = (query.state.data ?? []) as MediaGeneration[];
      return items.some((item) => ["queued", "pending", "generating", "processing"].includes(item.status)) ? 5000 : false;
    },
  });
};

export const useMediaUsageAnalytics = (): MediaUsageAnalytics => {
  const { user } = useAuth();
  const generationsQuery = useMediaGenerations();

  const analyticsQuery = useQuery({
    queryKey: ["media-usage-analytics", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_usage_events")
        .select("event_type, media_type, status, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as Pick<MediaUsageEvent, "event_type" | "media_type" | "status" | "created_at">[];
    },
    enabled: !!user,
  });

  return useMemo(() => {
    const events = analyticsQuery.data ?? [];
    const activeJobs = (generationsQuery.data ?? []).filter((item) => ["queued", "pending", "generating", "processing"].includes(item.status)).length;

    return {
      totalRequests: events.filter((event) => event.event_type === "requested").length,
      totalCompleted: events.filter((event) => event.event_type === "completed").length,
      totalFailed: events.filter((event) => event.event_type === "failed").length,
      imageCompleted: events.filter((event) => event.event_type === "completed" && event.media_type === "image").length,
      videoCompleted: events.filter((event) => event.event_type === "completed" && event.media_type === "video").length,
      activeJobs,
    };
  }, [analyticsQuery.data, generationsQuery.data]);
};

export const useCreateMediaGeneration = () => {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { data: activeBusiness } = useActiveBusinessProfile();
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
      if (!activeBusiness?.id) {
        throw new Error("Create a business profile for this workspace before generating media.");
      }

      const { data, error } = await supabase.functions.invoke("generate-media", {
        body: {
          mediaType,
          prompt,
          durationSeconds: durationSeconds ?? null,
          workspaceId: workspace?.id ?? null,
          businessId: activeBusiness.id,
        },
      });

      if (error) throw new Error(error.message || "Generation request failed");
      if (data?.allowed === false) throw new Error(data.error || "Generation not allowed");

      return data as {
        generationId: string;
        status: string;
        providerKey: string;
        message: string;
        usage?: {
          imagesRemaining: number | null;
          videosRemaining: number | null;
          resetsAt: string | null;
        };
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["media-generations"] });
      queryClient.invalidateQueries({ queryKey: ["media-usage"] });
      queryClient.invalidateQueries({ queryKey: ["media-usage-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });

      toast({
        title: data.status === "queued" ? "Generation queued" : "Generation started",
        description: data.message || "Your media request is now processing.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
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
      return data ?? [];
    },
    enabled: !!user && !!workspace,
  });
};
