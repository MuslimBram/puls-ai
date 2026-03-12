import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PlanKey, PLANS } from "@/config/plans";

export { PLANS, type PlanKey } from "@/config/plans";

export interface StripeSubscriptionData {
  subscribed: boolean;
  plan: PlanKey;
  status: string;
  subscription_end?: string;
  trial_end?: string | null;
  cancel_at_period_end?: boolean;
}

export const useSubscription = () => {
  const { user } = useAuth();

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
    refetchInterval: 60000, // check every minute
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
  const currentPlan: PlanKey = planMap[rawPlan] ?? "standard";

  return {
    subscription: dbQuery.data,
    isLoading: dbQuery.isLoading || stripeQuery.isLoading,
    currentPlan,
    planDetails: PLANS[currentPlan],
    stripeData: stripeData ?? null,
    refetchStripe: stripeQuery.refetch,
  };
};
