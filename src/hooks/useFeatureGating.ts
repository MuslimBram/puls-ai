import { useMemo } from "react";
import { useSubscription } from "./useSubscription";
import { useRolePermissions } from "./useRolePermissions";
import type { PlanFeatures, PlanKey } from "@/types/monetization";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";

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
  const { currentPlan, selectedPlan, selectedPlanDetails, subscription, stripeData, refetchStripe, isTrialExpired } = useSubscription();
  const { permissions } = useRolePermissions();
  const { plansByKey, planOrder, defaultPlanKey } = useMonetizationCatalog();

  const highestPlanKey = (planOrder[planOrder.length - 1] as PlanKey | undefined) ?? defaultPlanKey;
  const fallbackPlanKey = defaultPlanKey;

  const plan = useMemo(() => {
    const key = currentPlan in plansByKey ? (currentPlan as PlanKey) : fallbackPlanKey;
    return plansByKey[key] ?? plansByKey[fallbackPlanKey] ?? null;
  }, [currentPlan, plansByKey, fallbackPlanKey]);

  const checkFeature = (feature: keyof PlanFeatures): FeatureGate => {
    if (!plan) return { allowed: false, requiredPlan: fallbackPlanKey, currentPlan: fallbackPlanKey };

    if (permissions.bypassFeatureGating) {
      return { allowed: true, requiredPlan: plan.key, currentPlan: plan.key };
    }

    if (plan.features[feature]) {
      return { allowed: true, requiredPlan: plan.key, currentPlan: plan.key };
    }

    const requiredPlan = (planOrder.find((planKey) => plansByKey[planKey]?.features[feature]) ?? highestPlanKey) as PlanKey;
    return { allowed: false, requiredPlan, currentPlan: plan.key };
  };

  const checkLimit = (
    limitKey: "channels" | "keywords" | "aiRepliesPerDay" | "teamMembers" | "leadsPerMonth" | "socialProfiles" | "automationRules",
    currentUsage: number,
  ): UsageStatus => {
    if (!plan) {
      return { current: currentUsage, limit: 0, percentage: 0, isAtLimit: true, isNearLimit: true, label: "Unavailable" };
    }

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
    if (!plan || permissions.bypassSubscription) return null;
    const idx = planOrder.indexOf(plan.key);
    return idx >= 0 && idx < planOrder.length - 1 ? (planOrder[idx + 1] as PlanKey) : null;
  };

  return {
    plan,
    displayPlan: selectedPlanDetails ?? plan,
    plansByKey,
    currentPlanKey: (selectedPlan ?? plan?.key ?? fallbackPlanKey) as PlanKey,
    effectivePlanKey: (plan?.key ?? fallbackPlanKey) as PlanKey,
    checkFeature,
    checkLimit,
    getUpgradePlan,
    subscription,
    stripeData: stripeData ?? null,
    refetchStripe,
    isTrialExpired,
  };
};