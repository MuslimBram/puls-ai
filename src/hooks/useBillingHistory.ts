import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface BillingRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  stripe_invoice_id: string | null;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  plan_name: string | null;
  discount_amount: number;
  refund_amount: number;
  invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export const useBillingHistory = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["billing-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_history")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as BillingRecord[];
    },
    enabled: !!user,
  });
};

export const usePaymentNotifications = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["payment-notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_notifications")
        .select("*")
        .eq("user_id", user!.id)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        notification_type: string;
        title: string;
        message: string;
        severity: string;
        is_read: boolean;
        created_at: string;
        metadata: any;
      }>;
    },
    enabled: !!user,
  });
};
