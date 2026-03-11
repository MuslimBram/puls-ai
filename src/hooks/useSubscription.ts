import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const PLANS = {
  free: { name: "Free", keywords: 5, channels: 2, leads: 50, price: 0 },
  pro: { name: "Pro", keywords: 25, channels: 10, leads: 500, price: 29 },
  enterprise: { name: "Enterprise", keywords: 100, channels: 50, leads: 5000, price: 99 },
} as const;

export type PlanKey = keyof typeof PLANS;

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

  const currentPlan = (query.data?.plan as PlanKey) ?? "free";

  return {
    subscription: query.data,
    isLoading: query.isLoading,
    currentPlan,
    planDetails: PLANS[currentPlan],
  };
};
