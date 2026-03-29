import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";

interface PayPalCheckoutButtonProps {
  amount: number;
  currency?: string;
  paymentType?: "one_time" | "donation";
  planKey?: string;
  description?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary";
  className?: string;
  onSuccess?: () => void;
}

export function PayPalCheckoutButton({
  amount,
  currency = "USD",
  paymentType = "one_time",
  planKey,
  description,
  label,
  variant = "default",
  className,
  onSuccess,
}: PayPalCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-paypal-order", {
        body: { amount, currency, paymentType, planKey, description },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.approveUrl) {
        // Store orderId for capture after redirect
        sessionStorage.setItem("paypal_order_id", data.orderId);
        sessionStorage.setItem("paypal_payment_type", paymentType);
        window.location.href = data.approveUrl;
      } else {
        throw new Error("PayPal checkout URL not received");
      }
    } catch (err: any) {
      console.error("PayPal checkout error:", err);
      toast.error(err.message || "Failed to start PayPal checkout");
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = label || (paymentType === "donation" ? "Donate with PayPal" : "Pay with PayPal");

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant={variant}
      className={className}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z" />
        </svg>
      )}
      {buttonLabel}
    </Button>
  );
}
