import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import type { PlanKey } from "@/types/monetization";
import { DEFAULT_PLAN_KEY, isPlanKey } from "@/types/monetization";

export type { PlanKey } from "@/types/monetization";

export interface ReferralDiscountInfo {
  percent: number;
  months_remaining: number;
  expires_at: string;
  total_savings: number;
}

export interface StripeSubscriptionData {
  subscribed: boolean;
  plan: PlanKey;
  status: string;
  subscription_end?: string;
  trial_end?: string | null;
  trial_start?: string | null;
  cancel_at_period_end?: boolean;
  grace_period_end?: string | null;
  leads_used?: number;
  ai_replies_today?: number;
  referral_discount?: ReferralDiscountInfo | null;
}

const normalizePlanKey = (value: string | null | undefined, fallback: PlanKey = DEFAULT_PLAN_KEY): PlanKey => {
  if (!value) return fallback;
  if (isPlanKey(value)) return value;
  if (value === "free") return DEFAULT_PLAN_KEY;
  if (value === "pro") return "professional";
  return fallback;
};

export const useSubscription = () => {
  const { user } = useAuth();
  const { isSuperAdmin } = useRolePermissions();
  const { plansByKey, planOrder, defaultPlanKey } = useMonetizationCatalog();

  const dbQuery = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const stripeQuery = useQuery({
    queryKey: ["stripe-subscription", user?.id],
    queryFn: async (): Promise<StripeSubscriptionData> => {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) {
        console.error("check-subscription error:", error);
        return { subscribed: false, plan: DEFAULT_PLAN_KEY, status: "none" };
      }
      return data as StripeSubscriptionData;
    },
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const stripeData = stripeQuery.data;
  const fallbackPlanKey = defaultPlanKey;
  const rawPlan = normalizePlanKey(stripeData?.plan ?? dbQuery.data?.plan ?? fallbackPlanKey, fallbackPlanKey);

  if (isSuperAdmin) {
    const adminPlanKey = (planOrder[planOrder.length - 1] as PlanKey | undefined) ?? fallbackPlanKey;
    return {
      subscription: dbQuery.data,
      isLoading: dbQuery.isLoading || stripeQuery.isLoading,
      currentPlan: adminPlanKey,
      planDetails: plansByKey[adminPlanKey] ?? null,
      stripeData: stripeData ?? null,
      refetchStripe: stripeQuery.refetch,
    };
  }

  let currentPlan = normalizePlanKey(rawPlan, fallbackPlanKey);

  if (stripeData) {
    const now = new Date();
    if (stripeData.status === "trialing" && stripeData.trial_end && new Date(stripeData.trial_end) < now) {
      currentPlan = fallbackPlanKey;
    }

    if (stripeData.status === "past_due" && (!stripeData.grace_period_end || new Date(stripeData.grace_period_end) <= now)) {
      currentPlan = fallbackPlanKey;
    }

    if (["canceled", "unpaid"].includes(stripeData.status)) {
      currentPlan = fallbackPlanKey;
    }
  }

  return {
    subscription: dbQuery.data,
    isLoading: dbQuery.isLoading || stripeQuery.isLoading,
    currentPlan,
    planDetails: plansByKey[currentPlan] ?? plansByKey[fallbackPlanKey] ?? null,
    stripeData: stripeData ?? null,
    refetchStripe: stripeQuery.refetch,
  };
};
