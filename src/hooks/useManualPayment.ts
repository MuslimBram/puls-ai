import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupportedCurrency } from "@/lib/currency";

export type ManualPaymentMethod =
  | "bank_transfer_ALL"
  | "bank_transfer_EUR"
  | "bank_transfer_USD"
  | "payoneer_EUR"
  | "payoneer_USD";

export interface PaymentMethodConfig {
  method_type: ManualPaymentMethod;
  display_name: string;
  instructions: string;
  currency: string;
  country_target: string | null;
}

export interface ManualPaymentResult {
  payment_id: string;
  reference_id: string;
  status: string;
  instructions: string;
  payment_method: string;
  charged: { amount: number; currency: string };
  base: { amount: number; currency: string };
  fx_rate: number | null;
  message: string;
}

export const useManualPayment = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fetch available payment methods for a given currency */
  const getOptions = async (currency: SupportedCurrency, country?: string) => {
    const { data, error } = await supabase.functions.invoke("process-manual-payment", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      body: undefined,
    });
    // Use query params via direct fetch since Supabase SDK doesn't support GET params cleanly
    const { data: { session } } = await supabase.auth.getSession();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-manual-payment?action=get_options&currency=${currency}${country ? `&country=${country}` : ""}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    if (!res.ok) throw new Error("Failed to load payment options");
    return res.json() as Promise<{
      available: PaymentMethodConfig[];
      recommended_order: string[];
      supported_currencies: string[];
      fx_rates: Record<string, number>;
    }>;
  };

  /** Create a manual payment record and get reference ID + instructions */
  const createPayment = async (params: {
    plan_key: string;
    package_type: string;
    payment_method: ManualPaymentMethod;
    charged_currency: SupportedCurrency;
    charged_amount: number;
    workspace_id?: string;
    customer_note?: string;
  }): Promise<ManualPaymentResult> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("process-manual-payment", {
        body: { ...params, action: "create" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ManualPaymentResult;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  /** Customer confirms they have sent the payment */
  const submitConfirmation = async (payment_id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-manual-payment", {
        body: { action: "submit", payment_id },
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  };

  /** Check status of a manual payment */
  const checkStatus = async (payment_id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-manual-payment?action=status&payment_id=${payment_id}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    return res.json();
  };

  return { createPayment, submitConfirmation, checkStatus, getOptions, loading, error };
};
