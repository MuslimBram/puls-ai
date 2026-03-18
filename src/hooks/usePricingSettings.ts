import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface PricingSetting {
  id: string;
  plan_key: string;
  monthly_price: number;
  annual_price: number;
  is_donation: boolean;
  donation_label: string | null;
  updated_at: string;
  updated_by: string | null;
  daily_image_limit: number | null;
  daily_video_limit: number | null;
  max_video_seconds: number | null;
  social_profiles_limit: number | null;
  channels_limit: number | null;
  keywords_limit: number | null;
  keywords_per_group_limit: number | null;
  ai_replies_per_day_limit: number | null;
  team_members_limit: number | null;
  conversation_history_days: number | null;
  leads_per_month_limit: number | null;
  automation_rules_limit: number | null;
  feature_entitlements: Record<string, boolean> | null;
}

interface UpdatePricingParams {
  id: string;
  plan_key?: string;
  is_donation?: boolean;
  monthly_price: number;
  annual_price: number;
  donation_label?: string;
  daily_image_limit?: number | null;
  daily_video_limit?: number | null;
  max_video_seconds?: number | null;
  social_profiles_limit?: number | null;
  channels_limit?: number | null;
  keywords_limit?: number | null;
  keywords_per_group_limit?: number | null;
  ai_replies_per_day_limit?: number | null;
  team_members_limit?: number | null;
  conversation_history_days?: number | null;
  leads_per_month_limit?: number | null;
  automation_rules_limit?: number | null;
  feature_entitlements?: Record<string, boolean>;
}

export const usePricingSettings = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pricing-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_settings" as any)
        .select("*")
        .order("plan_key");
      if (error) throw error;
      return (data || []) as unknown as PricingSetting[];
    },
  });

  const updatePrice = useMutation({
    mutationFn: async (params: UpdatePricingParams) => {
      const now = new Date().toISOString();
      const pricingUpdate = {
        monthly_price: params.monthly_price,
        annual_price: params.annual_price,
        donation_label: params.donation_label,
        daily_image_limit: params.daily_image_limit,
        daily_video_limit: params.daily_video_limit,
        max_video_seconds: params.max_video_seconds,
        social_profiles_limit: params.social_profiles_limit,
        channels_limit: params.channels_limit,
        keywords_limit: params.keywords_limit,
        keywords_per_group_limit: params.keywords_per_group_limit,
        ai_replies_per_day_limit: params.ai_replies_per_day_limit,
        team_members_limit: params.team_members_limit,
        conversation_history_days: params.conversation_history_days,
        leads_per_month_limit: params.leads_per_month_limit,
        automation_rules_limit: params.automation_rules_limit,
        feature_entitlements: params.feature_entitlements,
        updated_at: now,
      } as any;

      const { error } = await supabase
        .from("pricing_settings" as any)
        .update(pricingUpdate)
        .eq("id", params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing-settings"] });
      queryClient.invalidateQueries({ queryKey: ["monetization-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["pricing-comparison"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["media-usage"] });
      queryClient.invalidateQueries({ queryKey: ["stripe-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["admin-media-usage-policies"] });
      toast.success("Pricing and plan limits updated");
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const plans = (query.data || []).filter((p) => !p.is_donation);
  const donations = (query.data || []).filter((p) => p.is_donation);

  const getPlanPrice = (planKey: string) => {
    const found = plans.find((p) => p.plan_key === planKey);
    return found ? { monthly: Number(found.monthly_price), annual: Number(found.annual_price) } : null;
  };

  return { settings: query.data || [], plans, donations, getPlanPrice, updatePrice, isLoading: query.isLoading };
};
