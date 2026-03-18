import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import type { PlanKey } from "@/config/plans";

const ORDERED_PLAN_KEYS: PlanKey[] = ["standard", "professional", "advanced", "enterprise"];

export type { PlanKey } from "@/config/plans";

const useIsAdminRole = () => {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["user-role-admin-check", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
    staleTime: 300000,
  });
  return query.data ?? false;
};

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

const normalizePlanKey = (value: string | null | undefined, fallback: PlanKey = "standard"): PlanKey => {
  if (!value) return fallback;
  if (ORDERED_PLAN_KEYS.includes(value as PlanKey)) return value as PlanKey;
  if (value === "free") return "standard";
  if (value === "pro") return "professional";
  return fallback;
};

export const useSubscription = () => {
  const { user } = useAuth();
  const isAdminRole = useIsAdminRole();
  const { plansByKey, planOrder } = useMonetizationCatalog();

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
        return { subscribed: false, plan: "standard", status: "none" };
      }
      return data as StripeSubscriptionData;
    },
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const stripeData = stripeQuery.data;
  const rawPlan = normalizePlanKey(stripeData?.plan ?? dbQuery.data?.plan ?? "standard");
  const fallbackPlanKey = (planOrder[0] as PlanKey | undefined) ?? "standard";

  if (isAdminRole) {
    const adminPlanKey = (planOrder[planOrder.length - 1] as PlanKey | undefined) ?? "enterprise";
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
