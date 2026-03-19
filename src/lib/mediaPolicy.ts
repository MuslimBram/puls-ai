import type { Database } from "@/integrations/supabase/types";
import type { Plan, PlanKey } from "@/types/monetization";

type MediaUsageDaily = Database["public"]["Tables"]["media_usage_daily"]["Row"];

export interface CatalogMediaPolicy {
  planKey: PlanKey;
  daily_image_limit: number;
  daily_video_limit: number;
  daily_video_seconds_limit: number;
  max_video_seconds: number;
  allow_image_generation: boolean;
  allow_video_generation: boolean;
}

export const resolveCatalogMediaPolicy = (
  plan: Pick<Plan, "key" | "limits" | "features"> | null | undefined,
): CatalogMediaPolicy | null => {
  if (!plan) return null;

  const mediaGenerationEnabled = Boolean(plan.features.mediaGeneration);

  return {
    planKey: plan.key,
    daily_image_limit: plan.limits.imagesPerMonth,
    daily_video_limit: plan.limits.videosPerMonth,
    daily_video_seconds_limit: plan.limits.videoMaxSeconds === -1 ? -1 : plan.limits.videosPerMonth * plan.limits.videoMaxSeconds,
    max_video_seconds: plan.limits.videoMaxSeconds,
    allow_image_generation: mediaGenerationEnabled,
    allow_video_generation: mediaGenerationEnabled,
  };
};

export const normalizeMediaDailyUsage = (daily: MediaUsageDaily | null, policy: CatalogMediaPolicy) => {
  const now = Date.now();
  const windowEndsAt = daily?.window_ends_at ? new Date(daily.window_ends_at).getTime() : null;

  if (!daily || (windowEndsAt !== null && windowEndsAt <= now)) {
    return {
      image_count: 0,
      video_count: 0,
      video_seconds_used: 0,
      window_ends_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      image_limit: policy.daily_image_limit,
      video_limit: policy.daily_video_limit,
      video_seconds_limit: policy.daily_video_seconds_limit,
    };
  }

  return {
    image_count: daily.image_count,
    video_count: daily.video_count,
    video_seconds_used: daily.video_seconds_used,
    window_ends_at: daily.window_ends_at,
    image_limit: daily.image_limit,
    video_limit: daily.video_limit,
    video_seconds_limit: daily.video_seconds_limit,
  };
};