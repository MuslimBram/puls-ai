import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useToast } from "@/hooks/use-toast";

export type MediaGeneration = Database["public"]["Tables"]["media_generations"]["Row"];
type MediaUsageDaily = Database["public"]["Tables"]["media_usage_daily"]["Row"];
type MediaUsagePolicy = Database["public"]["Tables"]["media_usage_policy"]["Row"];
type MediaUsageEvent = Database["public"]["Tables"]["media_usage_events"]["Row"];

const DEFAULT_POLICY_BY_PLAN = {
  standard: {
    plan_key: "standard",
    daily_image_limit: 5,
    daily_video_limit: 3,
    max_video_seconds: 10,
    allow_image_generation: true,
    allow_video_generation: true,
  },
  professional: {
    plan_key: "professional",
    daily_image_limit: 25,
    daily_video_limit: 10,
    max_video_seconds: 20,
    allow_image_generation: true,
    allow_video_generation: true,
  },
  advanced: {
    plan_key: "advanced",
    daily_image_limit: 100,
    daily_video_limit: 30,
    max_video_seconds: 60,
    allow_image_generation: true,
    allow_video_generation: true,
  },
  enterprise: {
    plan_key: "enterprise",
    daily_image_limit: 1000,
    daily_video_limit: 300,
    max_video_seconds: 120,
    allow_image_generation: true,
    allow_video_generation: true,
  },
} as const;

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

const getFallbackPolicy = (planKey: string) => {
  return DEFAULT_POLICY_BY_PLAN[planKey as keyof typeof DEFAULT_POLICY_BY_PLAN] ?? DEFAULT_POLICY_BY_PLAN.standard;
};

const normalizeDailyUsage = (daily: MediaUsageDaily | null, policy: Pick<MediaUsagePolicy, "daily_image_limit" | "daily_video_limit">) => {
  const now = Date.now();
  const windowEndsAt = daily?.window_ends_at ? new Date(daily.window_ends_at).getTime() : null;

  if (!daily || (windowEndsAt !== null && windowEndsAt <= now)) {
    return {
      image_count: 0,
      video_count: 0,
      window_ends_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      image_limit: policy.daily_image_limit,
      video_limit: policy.daily_video_limit,
    };
  }

  return {
    image_count: daily.image_count,
    video_count: daily.video_count,
    window_ends_at: daily.window_ends_at,
    image_limit: daily.image_limit,
    video_limit: daily.video_limit,
  };
};

export const useMediaUsage = (): MediaUsageStatus => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { currentPlanKey } = useFeatureGating();

  const query = useQuery({
    queryKey: ["media-usage", user?.id, workspace?.id, currentPlanKey],
    queryFn: async () => {
      const [policyResult, dailyResult] = await Promise.all([
        supabase
          .from("media_usage_policy")
          .select("*")
          .eq("plan_key", currentPlanKey)
          .maybeSingle(),
        supabase
          .from("media_usage_daily")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);

      if (policyResult.error) throw policyResult.error;
      if (dailyResult.error) throw dailyResult.error;

      const resolvedPolicy = (policyResult.data ?? getFallbackPolicy(currentPlanKey)) as Pick<
        MediaUsagePolicy,
        | "plan_key"
        | "daily_image_limit"
        | "daily_video_limit"
        | "max_video_seconds"
        | "allow_image_generation"
        | "allow_video_generation"
      >;

      const normalizedDaily = normalizeDailyUsage(dailyResult.data, resolvedPolicy);
      const imagesLimit = normalizedDaily.image_limit;
      const videosLimit = normalizedDaily.video_limit;
      const imagesRemaining = imagesLimit === -1 ? Number.POSITIVE_INFINITY : Math.max(0, imagesLimit - normalizedDaily.image_count);
      const videosRemaining = videosLimit === -1 ? Number.POSITIVE_INFINITY : Math.max(0, videosLimit - normalizedDaily.video_count);

      return {
        planKey: resolvedPolicy.plan_key,
        imagesUsedToday: normalizedDaily.image_count,
        imagesLimit,
        videosUsedToday: normalizedDaily.video_count,
        videosLimit,
        videoMaxSeconds: resolvedPolicy.max_video_seconds,
        imagesRemaining,
        videosRemaining,
        resetsAt: normalizedDaily.window_ends_at,
        isImageLimitReached: imagesLimit !== -1 && normalizedDaily.image_count >= imagesLimit,
        isVideoLimitReached: videosLimit !== -1 && normalizedDaily.video_count >= videosLimit,
        canGenerateImages: resolvedPolicy.allow_image_generation && (imagesLimit === -1 || normalizedDaily.image_count < imagesLimit),
        canGenerateVideos: resolvedPolicy.allow_video_generation && (videosLimit === -1 || normalizedDaily.video_count < videosLimit),
      };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (query.data) {
    return {
      ...query.data,
      isLoading: query.isLoading,
    };
  }

  return {
    planKey: currentPlanKey,
    imagesUsedToday: 0,
    imagesLimit: getFallbackPolicy(currentPlanKey).daily_image_limit,
    videosUsedToday: 0,
    videosLimit: getFallbackPolicy(currentPlanKey).daily_video_limit,
    videoMaxSeconds: getFallbackPolicy(currentPlanKey).max_video_seconds,
    imagesRemaining: getFallbackPolicy(currentPlanKey).daily_image_limit,
    videosRemaining: getFallbackPolicy(currentPlanKey).daily_video_limit,
    resetsAt: null,
    isImageLimitReached: false,
    isVideoLimitReached: false,
    canGenerateImages: true,
    canGenerateVideos: true,
    isLoading: query.isLoading,
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
      return data as MediaGeneration[];
    },
    enabled: !!user && !!workspace,
    refetchInterval: (query) => {
      const items = (query.state.data ?? []) as MediaGeneration[];
      return items.some((item) => ["queued", "pending", "generating", "processing"].includes(item.status)) ? 5000 : false;
    },
  });
};

export const useMediaUsageAnalytics = (): MediaUsageAnalytics => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const generationsQuery = useMediaGenerations();

  const analyticsQuery = useQuery({
    queryKey: ["media-usage-analytics", user?.id, workspace?.id],
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
      const { data, error } = await supabase.functions.invoke("generate-media", {
        body: {
          mediaType,
          prompt,
          durationSeconds: durationSeconds ?? null,
          workspaceId: workspace?.id ?? null,
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
