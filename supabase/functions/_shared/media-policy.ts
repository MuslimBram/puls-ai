export interface PricingMediaPolicy {
  planKey: string;
  dailyImageLimit: number;
  dailyVideoLimit: number;
  dailyVideoSecondsLimit: number;
  maxVideoSeconds: number;
  allowImageGeneration: boolean;
  allowVideoGeneration: boolean;
}

type PricingSettingMediaRow = {
  plan_key: string;
  daily_image_limit: number | null;
  daily_video_limit: number | null;
  daily_video_seconds_limit: number | null;
  max_video_seconds: number | null;
  feature_entitlements: Record<string, unknown> | null;
};

const requireNumber = (value: number | null, field: string, planKey: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Pricing catalog field \"${field}\" is missing for plan \"${planKey}\".`);
  }

  return value;
};

const asEntitlements = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

export const normalizeSubscriptionPlan = (plan: string | null | undefined): string | null => {
  if (!plan) return null;
  if (plan === "free") return "standard";
  if (plan === "pro") return "professional";
  return plan;
};

export const loadPricingMediaPolicy = async (supabaseClient: any, planKey: string): Promise<PricingMediaPolicy> => {
  const { data, error } = await supabaseClient
    .from("pricing_settings")
    .select("plan_key, daily_image_limit, daily_video_limit, daily_video_seconds_limit, max_video_seconds, feature_entitlements")
    .eq("plan_key", planKey)
    .eq("is_donation", false)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(`Pricing catalog is missing media policy for plan \"${planKey}\".`);
  }

  const row = data as PricingSettingMediaRow;
  const entitlements = asEntitlements(row.feature_entitlements);
  const mediaGenerationEnabled = Boolean(entitlements.mediaGeneration);

  return {
    planKey: row.plan_key,
    dailyImageLimit: requireNumber(row.daily_image_limit, "daily_image_limit", row.plan_key),
    dailyVideoLimit: requireNumber(row.daily_video_limit, "daily_video_limit", row.plan_key),
    dailyVideoSecondsLimit: requireNumber(row.daily_video_seconds_limit, "daily_video_seconds_limit", row.plan_key),
    maxVideoSeconds: requireNumber(row.max_video_seconds, "max_video_seconds", row.plan_key),
    allowImageGeneration: mediaGenerationEnabled,
    allowVideoGeneration: mediaGenerationEnabled,
  };
};