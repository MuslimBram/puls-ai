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
    mutationFn: async (params: { id: string; monthly_price: number; annual_price: number; donation_label?: string }) => {
      const { error } = await supabase
        .from("pricing_settings" as any)
        .update({
          monthly_price: params.monthly_price,
          annual_price: params.annual_price,
          donation_label: params.donation_label,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing-settings"] });
      toast.success("Price updated");
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
