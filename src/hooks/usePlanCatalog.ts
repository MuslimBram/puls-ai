import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_ORDER, PLANS, Plan, PlanFeatures, PlanKey } from "@/config/plans";

const isFeatureRecord = (value: unknown): value is Partial<Record<keyof PlanFeatures, boolean>> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const numberOrFallback = (value: unknown, fallback: number) => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

export const usePlanCatalog = () => {
  const query = useQuery({
    queryKey: ["plan-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_settings" as any)
        .select("*")
        .eq("is_donation", false)
        .order("plan_key");

      if (error) throw error;

      const rows = ((data ?? []) as unknown[]) as Record<string, unknown>[];
      const rowMap = new Map<string, Record<string, unknown>>(rows.map((row) => [String(row.plan_key), row]));

      return PLAN_ORDER.reduce((acc, planKey) => {
        const fallbackPlan = PLANS[planKey];
        const row = rowMap.get(planKey);

        acc[planKey] = !row
          ? fallbackPlan
          : ({
              ...fallbackPlan,
              monthlyPrice: numberOrFallback(row.monthly_price, fallbackPlan.monthlyPrice),
              annualPrice: numberOrFallback(row.annual_price, fallbackPlan.annualPrice),
              limits: {
                ...fallbackPlan.limits,
                socialProfiles: numberOrFallback(row.social_profiles_limit, fallbackPlan.limits.socialProfiles),
                channels: numberOrFallback(row.channels_limit, fallbackPlan.limits.channels),
                keywords: numberOrFallback(row.keywords_limit, fallbackPlan.limits.keywords),
                keywordsPerGroup: numberOrFallback(row.keywords_per_group_limit, fallbackPlan.limits.keywordsPerGroup),
                aiRepliesPerDay: numberOrFallback(row.ai_replies_per_day_limit, fallbackPlan.limits.aiRepliesPerDay),
                automationRules: numberOrFallback(row.automation_rules_limit, fallbackPlan.limits.automationRules),
                teamMembers: numberOrFallback(row.team_members_limit, fallbackPlan.limits.teamMembers),
                conversationHistoryDays: numberOrFallback(row.conversation_history_days, fallbackPlan.limits.conversationHistoryDays),
                leadsPerMonth: numberOrFallback(row.leads_per_month_limit, fallbackPlan.limits.leadsPerMonth),
              },
              features: {
                ...fallbackPlan.features,
                ...(isFeatureRecord(row.feature_entitlements) ? row.feature_entitlements : {}),
              },
            } satisfies Plan);

        return acc;
      }, {} as Record<PlanKey, Plan>);
    },
    staleTime: 30000,
  });

  return {
    plansByKey: query.data ?? PLANS,
    isLoading: query.isLoading,
  };
};
