import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { Plan, PlanFeatures, PlanKey } from "@/types/monetization";
import { DEFAULT_PLAN_KEY, FEATURE_KEYS, isPlanKey } from "@/types/monetization";
import { toast } from "@/components/ui/sonner";

const baseFeatures = FEATURE_KEYS.reduce((acc, key) => {
  acc[key] = false;
  return acc;
}, {} as PlanFeatures);

const numberOr = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const normalizeFeatureRecord = (value: Json | null): PlanFeatures => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return baseFeatures;
  const input = value as Record<string, unknown>;
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = typeof input[key] === "boolean" ? Boolean(input[key]) : baseFeatures[key];
    return acc;
  }, { ...baseFeatures });
};

const getSupportLabel = (plan: Pick<Plan, "features" | "limits" | "key">) => {
  if (plan.features.dedicatedSuccessManager) return "Dedicated manager";
  if (plan.features.prioritySupport || plan.key === "advanced") return "Priority";
  if (plan.limits.teamMembers > 1 || plan.key === "professional") return "Extended";
  return "Standard";
};

type PricingSettingRow = Database["public"]["Tables"]["pricing_settings"]["Row"];
type PricingFeatureSectionRow = Database["public"]["Tables"]["pricing_feature_sections"]["Row"];
type PricingFeatureRowRow = Database["public"]["Tables"]["pricing_feature_rows"]["Row"];

type FeatureValue = string | boolean;
type MonetizationPlanRecord = Plan & {
  badgeLabel: string | null;
  stripePriceId: string | null;
  stripeProductId: string | null;
};

export interface PricingComparisonRow {
  id: string;
  featureKey: string;
  featureName: string;
  featureTooltip: string | null;
  isHighlight: boolean;
  values: Record<PlanKey, FeatureValue>;
}

export interface PricingComparisonSection {
  id: string;
  title: string;
  description: string | null;
  defaultExpanded: boolean;
  rows: PricingComparisonRow[];
}

export interface EnterpriseLeadInput {
  name: string;
  email: string;
  companyName?: string;
  phone?: string;
  teamSize?: string;
  message?: string;
}

const jsonToFeatureValue = (value: Json): FeatureValue => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "—";
};

export const useMonetizationCatalog = () => {
  const plansQuery = useQuery({
    queryKey: ["monetization-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_settings")
        .select("*")
        .eq("is_public", true)
        .order("sort_order", { ascending: true })
        .order("plan_key", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as PricingSettingRow[];
      const publicPlans = rows.filter(
        (row): row is PricingSettingRow & { plan_key: PlanKey } => !row.is_donation && isPlanKey(row.plan_key),
      );
      const donations = rows.filter((row) => row.is_donation);

      const plans = publicPlans.map<MonetizationPlanRecord>((row) => {
        const key = row.plan_key;
        const plan: Plan = {
          key,
          name: row.plan_label || row.plan_name || row.plan_key,
          description: row.plan_description || "",
          monthlyPrice: row.monthly_price,
          annualPrice: row.annual_price,
          cta: row.cta_label || (row.stripe_price_id ? "Choose plan" : "Contact sales"),
          highlighted: row.highlight_plan,
          limits: {
            socialProfiles: numberOr(row.social_profiles_limit, -1),
            channels: numberOr(row.channels_limit, -1),
            keywords: numberOr(row.keywords_limit, -1),
            keywordsPerGroup: numberOr(row.keywords_per_group_limit, -1),
            aiRepliesPerDay: numberOr(row.ai_replies_per_day_limit, -1),
            automationRules: numberOr(row.automation_rules_limit, -1),
            teamMembers: numberOr(row.team_members_limit, -1),
            conversationHistoryDays: numberOr(row.conversation_history_days, -1),
            leadsPerMonth: numberOr(row.leads_per_month_limit, -1),
            imagesPerMonth: numberOr(row.daily_image_limit, -1),
            videosPerMonth: numberOr(row.daily_video_limit, -1),
            videoMaxSeconds: numberOr(row.max_video_seconds, -1),
          },
          features: normalizeFeatureRecord(row.feature_entitlements),
          support: "Standard",
        };

        return {
          ...plan,
          support: getSupportLabel(plan),
          badgeLabel: row.badge_label,
          stripePriceId: row.stripe_price_id,
          stripeProductId: row.stripe_product_id,
        };
      });

      const plansByKey = Object.fromEntries(plans.map((plan) => [plan.key, plan])) as Record<PlanKey, MonetizationPlanRecord>;
      const planOrder = plans.map((plan) => plan.key);

      return { rows, plans, plansByKey, planOrder, donations };
    },
    staleTime: 30000,
  });

  const comparisonQuery = useQuery({
    queryKey: ["pricing-comparison"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_feature_sections")
        .select("*, pricing_feature_rows(*)")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const sections = ((data ?? []) as unknown[]).map((section) => {
        const raw = section as PricingFeatureSectionRow & { pricing_feature_rows?: PricingFeatureRowRow[] };
        const rows = (raw.pricing_feature_rows ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map<PricingComparisonRow>((row) => ({
            id: row.id,
            featureKey: row.feature_key,
            featureName: row.feature_name,
            featureTooltip: row.feature_tooltip,
            isHighlight: row.is_highlight,
            values: {
              standard: jsonToFeatureValue(row.standard_value),
              professional: jsonToFeatureValue(row.professional_value),
              advanced: jsonToFeatureValue(row.advanced_value),
              enterprise: jsonToFeatureValue(row.enterprise_value),
            },
          }));

        return {
          id: raw.id,
          title: raw.title,
          description: raw.description,
          defaultExpanded: raw.default_expanded,
          rows,
        } satisfies PricingComparisonSection;
      });

      return sections;
    },
    staleTime: 30000,
  });

  return {
    plans: plansQuery.data?.plans ?? [],
    plansByKey: plansQuery.data?.plansByKey ?? ({} as Record<PlanKey, MonetizationPlanRecord>),
    planOrder: plansQuery.data?.planOrder ?? ([] as PlanKey[]),
    donations: plansQuery.data?.donations ?? [],
    comparisonSections: comparisonQuery.data ?? [],
    defaultPlanKey: (plansQuery.data?.planOrder?.[0] as PlanKey | undefined) ?? DEFAULT_PLAN_KEY,
    isLoading: plansQuery.isLoading || comparisonQuery.isLoading,
  };
};

export const useEnterpriseLeadSubmission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: EnterpriseLeadInput) => {
      const { data, error } = await supabase.functions.invoke("submit-enterprise-lead", {
        body: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-enterprise-leads"] });
      toast.success("Your enterprise request was sent.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send enterprise request");
    },
  });
};

export const useIsCurrentPlan = (planKey: PlanKey, currentPlanKey: PlanKey) => planKey === currentPlanKey;

export const useVisiblePlanMatrix = () => {
  const { plans, planOrder, comparisonSections } = useMonetizationCatalog();

  return useMemo(() => ({ plans, planOrder, comparisonSections }), [plans, planOrder, comparisonSections]);
};
