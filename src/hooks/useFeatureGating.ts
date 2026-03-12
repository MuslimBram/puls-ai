import { useMemo } from "react";
import { useSubscription } from "./useSubscription";
import { PLANS, PlanKey, PlanFeatures } from "@/config/plans";

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

  const plan = useMemo(() => {
    const key = (currentPlan as PlanKey) in PLANS ? (currentPlan as PlanKey) : "standard";
    return PLANS[key];
  }, [currentPlan]);

  const checkFeature = (feature: keyof PlanFeatures): FeatureGate => {
    if (plan.features[feature]) {
      return { allowed: true, requiredPlan: plan.key, currentPlan: plan.key };
    }
    const planOrder: PlanKey[] = ["standard", "professional", "advanced", "enterprise"];
    const requiredPlan = planOrder.find((p) => PLANS[p].features[feature]) || "enterprise";
    return { allowed: false, requiredPlan, currentPlan: plan.key };
  };

  const checkLimit = (limitKey: "channels" | "keywords" | "aiRepliesPerDay" | "teamMembers" | "leadsPerMonth" | "socialProfiles" | "automationRules", currentUsage: number): UsageStatus => {
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
    const order: PlanKey[] = ["standard", "professional", "advanced", "enterprise"];
    const idx = order.indexOf(plan.key);
    return idx < order.length - 1 ? order[idx + 1] : null;
  };

  return {
    plan,
    currentPlanKey: plan.key,
    checkFeature,
    checkLimit,
    getUpgradePlan,
    subscription,
    stripeData: stripeData ?? null,
    refetchStripe,
  };
};
