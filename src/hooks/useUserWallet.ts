import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export const useUserWallets = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-wallets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_wallets")
        .select("*")
        .eq("user_id", user!.id)
        .order("currency");
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
};

export const useWalletTransactions = (walletId: string | undefined) => {
  return useQuery({
    queryKey: ["wallet-transactions", walletId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_wallet_transactions")
        .select("*")
        .eq("wallet_id", walletId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!walletId,
  });
};

export const useCreateWallet = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (currency: string) => {
      const { data, error } = await supabase
        .from("user_wallets")
        .insert({ user_id: user!.id, currency: currency.toUpperCase() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-wallets"] });
      toast.success("Portofoli u krijua");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useAddTransaction = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      wallet_id: string;
      type: string;
      amount: number;
      currency: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from("user_wallet_transactions")
        .insert({
          wallet_id: input.wallet_id,
          user_id: user!.id,
          type: input.type,
          amount: input.amount,
          currency: input.currency,
          description: input.description,
        })
        .select()
        .single();
      if (error) throw error;

      // Update wallet balance
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("*")
        .eq("id", input.wallet_id)
        .single();

      if (wallet) {
        const isCredit = ["deposit", "refund", "commission_credit"].includes(input.type);
        const balanceChange = isCredit ? input.amount : -input.amount;
        await supabase
          .from("user_wallets")
          .update({
            current_balance: Number(wallet.current_balance) + balanceChange,
            ...(isCredit ? { lifetime_deposits: Number(wallet.lifetime_deposits) + input.amount } : {}),
            ...(!isCredit ? { lifetime_withdrawals: Number(wallet.lifetime_withdrawals) + input.amount } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.wallet_id);
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-wallets"] });
      qc.invalidateQueries({ queryKey: ["wallet-transactions"] });
      toast.success("Transaksioni u regjistrua");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
