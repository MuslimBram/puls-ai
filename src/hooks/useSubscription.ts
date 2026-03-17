import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PlanKey, PLANS } from "@/config/plans";

export { PLANS, type PlanKey } from "@/config/plans";

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

export const useSubscription = () => {
  const { user } = useAuth();
  const isAdminRole = useIsAdminRole();

  // Local DB subscription
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

  // Stripe subscription check
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

  // Use Stripe data if available, otherwise fall back to DB
  const stripeData = stripeQuery.data;
  const rawPlan = stripeData?.plan ?? dbQuery.data?.plan ?? "free";
  
  const planMap: Record<string, PlanKey> = {
    free: "standard",
    pro: "professional",
    enterprise: "enterprise",
    standard: "standard",
    professional: "professional",
    advanced: "advanced",
  };

  // Admin bypass: always enterprise
  if (isAdminRole) {
    return {
      subscription: dbQuery.data,
      isLoading: dbQuery.isLoading || stripeQuery.isLoading,
      currentPlan: "enterprise" as PlanKey,
      planDetails: PLANS["enterprise"],
      stripeData: stripeData ?? null,
      refetchStripe: stripeQuery.refetch,
    };
  }

  // Determine effective plan considering grace period and trial
  let currentPlan: PlanKey = planMap[rawPlan] ?? "standard";
  
  if (stripeData) {
    const now = new Date();
    const status = stripeData.status;
    
    if (status === "trialing" && stripeData.trial_end && new Date(stripeData.trial_end) < now) {
      currentPlan = "standard";
    }
    
    if (status === "past_due") {
      if (stripeData.grace_period_end && new Date(stripeData.grace_period_end) > now) {
        // Keep current plan during grace
      } else {
        currentPlan = "standard";
      }
    }
    
    if (["canceled", "unpaid"].includes(status)) {
      currentPlan = "standard";
    }
  }

  return {
    subscription: dbQuery.data,
    isLoading: dbQuery.isLoading || stripeQuery.isLoading,
    currentPlan,
    planDetails: PLANS[currentPlan],
    stripeData: stripeData ?? null,
    refetchStripe: stripeQuery.refetch,
  };
};
