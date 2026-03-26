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

export const useWithdrawalRequests = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["withdrawal-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
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

/** Deposit — goes through immediately */
export const useDepositToWallet = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { wallet_id: string; amount: number; currency: string; description?: string }) => {
      // Insert transaction
      const { error: txError } = await supabase
        .from("user_wallet_transactions")
        .insert({
          wallet_id: input.wallet_id,
          user_id: user!.id,
          type: "deposit",
          amount: input.amount,
          currency: input.currency,
          description: input.description,
        });
      if (txError) throw txError;

      // Update balance
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("*")
        .eq("id", input.wallet_id)
        .single();
      if (wallet) {
        await supabase
          .from("user_wallets")
          .update({
            current_balance: Number(wallet.current_balance) + input.amount,
            lifetime_deposits: Number(wallet.lifetime_deposits) + input.amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.wallet_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-wallets"] });
      qc.invalidateQueries({ queryKey: ["wallet-transactions"] });
      toast.success("Rimbushja u krye me sukses");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Withdrawal — creates a request, triggers AI check, requires admin approval */
export const useRequestWithdrawal = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { wallet_id: string; amount: number; currency: string; payout_method?: string; payout_details?: Record<string, unknown> }) => {
      // Create withdrawal request
      const { data: wr, error: wrError } = await supabase
        .from("withdrawal_requests")
        .insert([{
          user_id: user!.id,
          wallet_id: input.wallet_id,
          amount: input.amount,
          currency: input.currency,
          payout_method: input.payout_method ?? null,
          payout_details: (input.payout_details ?? {}) as Record<string, unknown>,
          status: "pending_ai_review",
        }])
        .select()
        .single();
      if (wrError) throw wrError;

      // Trigger AI fraud check
      const { data: aiResult, error: aiError } = await supabase.functions.invoke("withdrawal-fraud-check", {
        body: { withdrawal_request_id: wr.id },
      });

      if (aiError) {
        console.error("AI fraud check failed:", aiError);
      }

      return { request: wr, aiResult };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["withdrawal-requests"] });
      if (result.aiResult?.status === "blocked") {
        toast.error("Kërkesa u bllokua nga verifikimi automatik. Kontaktoni mbështetjen.");
      } else {
        toast.success("Kërkesa për tërheqje u dërgua. Në pritje të aprovimit nga Admini.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
