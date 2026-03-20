import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useCreditEconomy = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const packs = useQuery({
    queryKey: ["credit-packs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_packs").select("*").eq("is_active", true).order("price_cents");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const transactions = useQuery({
    queryKey: ["credit-transactions", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_transactions").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const currentBalance = transactions.data?.length ? (transactions.data[0].balance_after ?? 0) : 0;

  const todayUsage = (transactions.data ?? []).filter(
    t => t.transaction_type === "usage" && new Date(t.created_at).toDateString() === new Date().toDateString()
  ).reduce((s, t) => s + Math.abs(t.amount), 0);

  return { packs: packs.data ?? [], transactions: transactions.data ?? [], currentBalance, todayUsage, isLoading: transactions.isLoading };
};
