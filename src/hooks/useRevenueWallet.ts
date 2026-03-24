import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const useRevenueSplitConfig = () => {
  return useQuery({
    queryKey: ["revenue-split-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_split_config")
        .select("*")
        .eq("config_key", "default")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
};

export const useUpdateRevenueSplit = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: { platform_percent: number; owner_percent: number; freelancer_percent: number }) => {
      const total = values.platform_percent + values.owner_percent + values.freelancer_percent;
      if (Math.abs(total - 100) > 0.01) throw new Error("Percentages must total 100%");

      const { error } = await supabase
        .from("revenue_split_config")
        .update({
          platform_percent: values.platform_percent,
          owner_percent: values.owner_percent,
          freelancer_percent: values.freelancer_percent,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("config_key", "default");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenue-split-config"] });
      toast.success("Revenue split updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useOwnerWallet = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["owner-wallet", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_wallets")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });
};

export const useRevenueTransactions = (walletType?: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["revenue-transactions", user?.id, walletType],
    queryFn: async () => {
      let query = supabase
        .from("revenue_transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (walletType) {
        query = query.eq("wallet_type", walletType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });
};

export const useAllRevenueTransactions = () => {
  return useQuery({
    queryKey: ["all-revenue-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
};
