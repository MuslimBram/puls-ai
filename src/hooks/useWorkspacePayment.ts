import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useToast } from "@/hooks/use-toast";

export type PaymentProcessorType =
  | "stripe"
  | "paypal"
  | "wise"
  | "payoneer"
  | "square"
  | "razorpay"
  | "mpesa"
  | "bank_transfer"
  | "custom";

export interface PaymentAccount {
  type: PaymentProcessorType;
  label: string;
  value: string;
  is_primary?: boolean;
  country?: string;
  currency?: string;
  status?: "active" | "pending" | "verified";
}

export const useWorkspacePayment = (workspaceId: string | null) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { log } = useAuditLog();

  const query = useQuery({
    queryKey: ["workspace-payment", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, payment_mode, payment_accounts, workspace_owner_partner_id")
        .eq("id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        id: string;
        payment_mode: string;
        payment_accounts: PaymentAccount[];
        workspace_owner_partner_id: string | null;
      } | null;
    },
    enabled: !!workspaceId,
  });

  const updatePaymentMode = useMutation({
    mutationFn: async ({ mode }: { mode: string }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ payment_mode: mode } as any)
        .eq("id", workspaceId!);
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await log("payment_mode_change", "workspace", workspaceId!, {
        new_value: vars.mode,
        previous_value: query.data?.payment_mode,
      });
      queryClient.invalidateQueries({ queryKey: ["workspace-payment", workspaceId] });
      toast({ title: "Payment mode updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updatePaymentAccounts = useMutation({
    mutationFn: async ({ accounts }: { accounts: PaymentAccount[] }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ payment_accounts: accounts } as any)
        .eq("id", workspaceId!);
      if (error) throw error;
    },
    onSuccess: async () => {
      await log("payment_accounts_update", "workspace", workspaceId!);
      queryClient.invalidateQueries({ queryKey: ["workspace-payment", workspaceId] });
      toast({ title: "Payment accounts updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    updatePaymentMode,
    updatePaymentAccounts,
  };
};

// Admin: get all workspaces with payment info
export const useAdminWorkspacePayments = (enabled: boolean) => {
  return useQuery({
    queryKey: ["admin-workspace-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, payment_mode, payment_accounts, workspace_owner_partner_id, referred_by_partner_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        name: string;
        payment_mode: string;
        payment_accounts: PaymentAccount[];
        workspace_owner_partner_id: string | null;
        referred_by_partner_id: string | null;
        created_at: string;
      }>;
    },
    enabled,
  });
};
