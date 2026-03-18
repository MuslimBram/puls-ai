import { useMemo } from "react";
import { useSubscription } from "./useSubscription";
import { useRolePermissions } from "./useRolePermissions";
import { PLANS, PLAN_ORDER, PlanKey, PlanFeatures } from "@/config/plans";
import { usePlanCatalog } from "@/hooks/usePlanCatalog";

export interface FeatureGate {
  allowed: boolean;
  requiredPlan: PlanKey;
  currentPlan: PlanKey;
}

export interface UsageStatus {
  current: number;
  limit: number;
  percentage: number;
  isAtLimit: boolean;
  isNearLimit: boolean;
  label: string;
}

export const useFeatureGating = () => {
  const { currentPlan, subscription, stripeData, refetchStripe } = useSubscription();
  const { permissions } = useRolePermissions();
  const { plansByKey } = usePlanCatalog();

  const plan = useMemo(() => {
    const key = (currentPlan as PlanKey) in plansByKey ? (currentPlan as PlanKey) : "standard";
    return plansByKey[key] ?? PLANS[key];
  }, [currentPlan, plansByKey]);

  const checkFeature = (feature: keyof PlanFeatures): FeatureGate => {
    if (permissions.bypassFeatureGating) {
      return { allowed: true, requiredPlan: plan.key, currentPlan: plan.key };
    }

    if (plan.features[feature]) {
      return { allowed: true, requiredPlan: plan.key, currentPlan: plan.key };
    }

    const requiredPlan = PLAN_ORDER.find((planKey) => (plansByKey[planKey] ?? PLANS[planKey]).features[feature]) || "enterprise";
    return { allowed: false, requiredPlan, currentPlan: plan.key };
  };

  const checkLimit = (
    limitKey: "channels" | "keywords" | "aiRepliesPerDay" | "teamMembers" | "leadsPerMonth" | "socialProfiles" | "automationRules",
    currentUsage: number
  ): UsageStatus => {
    if (permissions.bypassUsageLimits) {
      return {
        current: currentUsage,
        limit: -1,
        percentage: 0,
        isAtLimit: false,
        isNearLimit: false,
        label: "Unlimited",
      };
    }

    const limit = plan.limits[limitKey];
    const isUnlimited = limit === -1;
    const percentage = isUnlimited ? 0 : Math.min(Math.round((currentUsage / limit) * 100), 100);

    return {
      current: currentUsage,
      limit,
      percentage,
      isAtLimit: !isUnlimited && currentUsage >= limit,
      isNearLimit: !isUnlimited && percentage >= 80,
      label: isUnlimited ? "Unlimited" : `${currentUsage} / ${limit}`,
    };
  };

  const getUpgradePlan = (): PlanKey | null => {
    if (permissions.bypassSubscription) return null;
    const idx = PLAN_ORDER.indexOf(plan.key);
    return idx < PLAN_ORDER.length - 1 ? PLAN_ORDER[idx + 1] : null;
  };

  return {
    plan,
    plansByKey,
    currentPlanKey: plan.key,
    checkFeature,
    checkLimit,
    getUpgradePlan,
    subscription,
    stripeData: stripeData ?? null,
    refetchStripe,
  };
};
