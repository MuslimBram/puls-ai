import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PlanKey, PLANS } from "@/config/plans";

export { PLANS, type PlanKey } from "@/config/plans";

export const useSubscription = () => {
  const { user } = useAuth();

  const query = useQuery({
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

  // Map old plan names to new ones
  const rawPlan = query.data?.plan ?? "free";
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
    subscription: query.data,
    isLoading: query.isLoading,
    currentPlan,
    planDetails: PLANS[currentPlan],
  };
};
