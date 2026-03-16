import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface PartnerWallet {
  id: string;
  partner_id: string;
  current_balance: number;
  lifetime_earnings: number;
  pending_amount: number;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  partner_id: string;
  type: string;
  amount: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface PartnerCommission {
  id: string;
  partner_id: string;
  workspace_id: string;
  plan_name: string;
  billing_period_start: string;
  billing_period_end: string;
  gross_amount: number;
  commission_percent: number;
  commission_amount: number;
  commission_status: string;
  created_at: string;
}

export interface PayoutRequest {
  id: string;
  partner_id: string;
  requested_amount: number;
  payout_status: string;
  payout_method: string;
  admin_note: string | null;
  processed_at: string | null;
  created_at: string;
}

export const usePartnerWallet = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["partner-wallet", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_wallets")
        .select("*")
        .eq("partner_id", partnerId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PartnerWallet | null;
    },
    enabled: !!partnerId,
  });
};

export const usePartnerCommissions = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["partner-commissions", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_commissions")
        .select("*")
        .eq("partner_id", partnerId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as PartnerCommission[];
    },
    enabled: !!partnerId,
  });
};

export const useWalletTransactions = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["wallet-transactions", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_wallet_transactions")
        .select("*")
        .eq("partner_id", partnerId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as WalletTransaction[];
    },
    enabled: !!partnerId,
  });
};

export const usePayoutRequests = (partnerId: string | null) => {
  return useQuery({
    queryKey: ["payout-requests", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("*")
        .eq("partner_id", partnerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PayoutRequest[];
    },
    enabled: !!partnerId,
  });
};

export const useRequestPayout = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ partnerId, amount, method }: { partnerId: string; amount: number; method?: string }) => {
      const { error } = await supabase
        .from("payout_requests")
        .insert({
          partner_id: partnerId,
          requested_amount: amount,
          payout_method: method || "manual",
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payout-requests"] });
      toast({ title: "Payout requested", description: "Your payout request has been submitted for review." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
};
