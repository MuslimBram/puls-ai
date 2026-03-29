import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Wallet, Zap, ArrowRight, LogOut, Check, Crown, Globe, DollarSign } from "lucide-react";
import { useUserWallets } from "@/hooks/useUserWallet";
import { cn } from "@/lib/utils";
import type { PlanKey } from "@/types/monetization";

interface PlanTier {
  key: PlanKey;
  name: string;
  basePrice: number;
  highlighted?: boolean;
}

const PLAN_TIERS: PlanTier[] = [
  { key: "standard", name: "Start", basePrice: 49 },
  { key: "professional", name: "Growth", basePrice: 99, highlighted: true },
  { key: "advanced", name: "PRO", basePrice: 199 },
  { key: "enterprise", name: "Enterprise", basePrice: 399 },
];

interface DurationOption {
  key: string;
  label: string;
  months: number;
  discountPercent: number;
}

const DURATION_OPTIONS: DurationOption[] = [
  { key: "trial", label: "7-Day Trial", months: 0, discountPercent: 0 },
  { key: "monthly", label: "Monthly", months: 1, discountPercent: 0 },
  { key: "3-month", label: "3 Months", months: 3, discountPercent: 5 },
  { key: "6-month", label: "6 Months", months: 6, discountPercent: 10 },
  { key: "yearly", label: "Yearly", months: 12, discountPercent: 15 },
];

const getDiscountedPrice = (base: number, discountPercent: number) =>
  Math.round(base * (1 - discountPercent / 100) * 100) / 100;

type PaymentMethod = "paypal" | "payoneer" | "wallet";

const CompletePayment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signOut } = useAuth();
  const { data: wallets } = useUserWallets();

  const metaPlan = user?.user_metadata?.billing_plan;
  const metaDuration = user?.user_metadata?.billing_duration;
  const accountType = user?.user_metadata?.account_type;
  const isAmbassador = accountType === "ambassador";

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(
    metaPlan && ["standard", "professional", "advanced", "enterprise"].includes(metaPlan)
      ? (metaPlan as PlanKey)
      : "standard"
  );
  const [selectedDuration, setSelectedDuration] = useState<string>(
    isAmbassador ? "trial" : (metaDuration || "monthly")
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(false);
  const [paypalCapturing, setPaypalCapturing] = useState(false);
  const [paypalResult, setPaypalResult] = useState<"success" | "failed" | null>(null);

  // Handle PayPal redirect capture
  useEffect(() => {
    const provider = searchParams.get("provider");
    const type = searchParams.get("type");
    const storedOrderId = sessionStorage.getItem("paypal_order_id");

    if (provider === "paypal" && storedOrderId && !paypalCapturing) {
      setPaypalCapturing(true);
      sessionStorage.removeItem("paypal_order_id");
      sessionStorage.removeItem("paypal_payment_type");

      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke("capture-paypal-order", {
            body: { orderId: storedOrderId },
          });
          if (error) throw error;
          if (data?.status === "COMPLETED") {
            setPaypalResult("success");
            toast.success("Payment completed successfully!");
            setTimeout(() => {
              navigate(type === "donation" ? "/pricing?checkout=success&type=donation" : "/dashboard");
            }, 2000);
          } else {
            setPaypalResult("failed");
            toast.error("Payment was not completed. Please try again.");
          }
        } catch (err: any) {
          console.error("PayPal capture error:", err);
          setPaypalResult("failed");
          toast.error(err.message || "Failed to complete PayPal payment");
        } finally {
          setPaypalCapturing(false);
        }
      })();
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentTier = PLAN_TIERS.find((t) => t.key === selectedPlan);
  const currentDuration = DURATION_OPTIONS.find((d) => d.key === selectedDuration);
  const basePrice = currentTier?.basePrice ?? 49;
  const isTrial = selectedDuration === "trial";
  const discountedPrice = isTrial ? 0 : getDiscountedPrice(basePrice, currentDuration?.discountPercent ?? 0);

  const walletBalance = wallets?.[0]?.current_balance ?? 0;
  const canPayFromWallet = walletBalance >= discountedPrice && discountedPrice > 0;
  const hasReferralEarnings = walletBalance > 0;

  const handleTrialStart = async () => {
    try {
      setLoading(true);
      toast.success("7-day trial activated!");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (method: PaymentMethod) => {
    if (method === "wallet") {
      if (!canPayFromWallet) {
        toast.error("Wallet balance insufficient");
        return;
      }
      setLoading(true);
      try {
        const { error } = await supabase.functions.invoke("wallet-subscribe", {
          body: { planKey: selectedPlan, packageType: selectedDuration },
        });
        if (error) throw error;
        toast.success("Payment completed successfully!");
        navigate("/dashboard");
      } catch (err: any) {
        toast.error(err.message || "Error processing wallet payment");
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (method === "paypal") {
        const { data, error } = await supabase.functions.invoke("create-paypal-order", {
          body: {
            amount: totalPrice,
            currency: "EUR",
            paymentType: "one_time",
            planKey: selectedPlan,
            description: `${currentTier?.name} plan - ${currentDuration?.label}`,
          },
        });
        if (error) throw error;
        if (data?.approveUrl) {
          sessionStorage.setItem("paypal_order_id", data.orderId);
          sessionStorage.setItem("paypal_payment_type", "one_time");
          window.location.href = data.approveUrl;
          return;
        }
        throw new Error("PayPal checkout URL not received");
      }

      // Fallback to Stripe for other methods
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          planKey: selectedPlan,
          packageType: selectedDuration === "monthly" ? "monthly" : selectedDuration,
          paymentMethod: method,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Payment link could not be created");
      }
    } catch (err: any) {
      toast.error(err.message || "Error creating payment");
    }
    setLoading(false);
  };

  const totalPrice = discountedPrice * (currentDuration?.months ?? 1);

  // Show PayPal processing/result overlay
  if (paypalCapturing || paypalResult) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12 space-y-4">
            {paypalCapturing && (
              <>
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <CardTitle>Processing Payment...</CardTitle>
                <CardDescription>Verifying your PayPal payment. Please wait.</CardDescription>
              </>
            )}
            {paypalResult === "success" && (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Check className="h-8 w-8 text-emerald-600" />
                </div>
                <CardTitle>Payment Successful!</CardTitle>
                <CardDescription>Redirecting to your dashboard...</CardDescription>
              </>
            )}
            {paypalResult === "failed" && (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                  <Zap className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle>Payment Failed</CardTitle>
                <CardDescription>Your payment could not be completed. Please try again.</CardDescription>
                <Button onClick={() => { setPaypalResult(null); navigate("/complete-payment"); }}>
                  Try Again
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Complete Payment</CardTitle>
          <CardDescription>
            Choose your plan and duration, then complete payment.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Plan selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Choose Plan:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PLAN_TIERS.map((tier) => {
                const isSelected = selectedPlan === tier.key;
                return (
                  <button
                    key={tier.key}
                    type="button"
                    onClick={() => setSelectedPlan(tier.key)}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-xl border-2 p-4 transition-all",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border hover:border-primary/50",
                      tier.highlighted && !isSelected && "border-primary/30"
                    )}
                  >
                    {tier.highlighted && (
                      <Crown className="absolute -top-2 right-2 h-4 w-4 text-primary" />
                    )}
                    {isSelected && (
                      <div className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <span className="text-sm font-bold text-foreground">{tier.name}</span>
                    <span className="text-lg font-semibold text-primary">€{tier.basePrice}</span>
                    <span className="text-[10px] text-muted-foreground">/mo</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Choose Duration:</p>
            <div className="grid gap-2">
              {DURATION_OPTIONS.map((dur) => {
                const price = dur.key === "trial" ? 0 : getDiscountedPrice(basePrice, dur.discountPercent);
                const isTrialOpt = dur.key === "trial";
                return (
                  <button
                    key={dur.key}
                    type="button"
                    onClick={() => setSelectedDuration(dur.key)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border-2 px-4 py-3 transition-all text-left",
                      selectedDuration === dur.key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border-2",
                        selectedDuration === dur.key ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}>
                        {selectedDuration === dur.key && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-foreground">{dur.label}</span>
                        {dur.discountPercent > 0 && (
                          <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                            Save {dur.discountPercent}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {isTrialOpt ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">€0</span>
                          <Badge className="text-[10px] px-1.5 py-0">Free</Badge>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">€{price}/mo</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plan:</span>
              <span className="font-semibold text-foreground">{currentTier?.name ?? "Start"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Duration:</span>
              <span className="font-semibold text-foreground">{currentDuration?.label ?? "Monthly"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Price:</span>
              <div className="flex items-center gap-2">
                {!isTrial && (currentDuration?.discountPercent ?? 0) > 0 && (
                  <span className="text-sm text-muted-foreground line-through">€{basePrice}</span>
                )}
                <span className="font-bold text-lg text-foreground">
                  {isTrial ? (
                    <><span>€0</span> <Badge className="ml-1 text-[10px]">Free 7 days</Badge></>
                  ) : (
                    <>€{discountedPrice.toFixed(0)}<span className="text-xs font-normal">/mo</span></>
                  )}
                </span>
              </div>
            </div>
            {!isTrial && (currentDuration?.months ?? 0) > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                <span className="text-sm text-muted-foreground">Total:</span>
                <span className="font-bold text-foreground">
                  €{totalPrice.toFixed(0)}
                  <span className="text-xs font-normal text-muted-foreground"> for {currentDuration?.months} months</span>
                </span>
              </div>
            )}
          </div>

          {/* Payment methods */}
          {isTrial ? (
            <Button
              className="w-full h-14 text-base"
              onClick={handleTrialStart}
              disabled={loading}
            >
              <Zap className="mr-2 h-5 w-5" />
              Start 7-Day Free Trial
              <ArrowRight className="ml-auto h-4 w-4" />
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Choose Payment Method:</p>

              <button
                type="button"
                onClick={() => setSelectedPaymentMethod("paypal")}
                className={cn(
                  "flex items-center gap-3 w-full rounded-lg border-2 px-4 py-3 transition-all text-left",
                  selectedPaymentMethod === "paypal"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border-2",
                  selectedPaymentMethod === "paypal" ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}>
                  {selectedPaymentMethod === "paypal" && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <Globe className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-foreground">PayPal</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentMethod("payoneer")}
                className={cn(
                  "flex items-center gap-3 w-full rounded-lg border-2 px-4 py-3 transition-all text-left",
                  selectedPaymentMethod === "payoneer"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border-2",
                  selectedPaymentMethod === "payoneer" ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}>
                  {selectedPaymentMethod === "payoneer" && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <DollarSign className="h-5 w-5 text-orange-500" />
                <span className="text-sm font-medium text-foreground">Payoneer</span>
              </button>

              {hasReferralEarnings && (
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("wallet")}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-lg border-2 px-4 py-3 transition-all text-left",
                    selectedPaymentMethod === "wallet"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                    !canPayFromWallet && "opacity-50"
                  )}
                  disabled={!canPayFromWallet}
                >
                  <div className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2",
                    selectedPaymentMethod === "wallet" ? "border-primary bg-primary" : "border-muted-foreground/40"
                  )}>
                    {selectedPaymentMethod === "wallet" && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <Wallet className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm font-medium text-foreground">Wallet</span>
                  <Badge variant="secondary" className="ml-auto">€{walletBalance.toFixed(2)}</Badge>
                </button>
              )}

              {hasReferralEarnings && !canPayFromWallet && selectedPaymentMethod === "wallet" && (
                <p className="text-xs text-destructive text-center">
                  Wallet balance insufficient. Choose PayPal or Payoneer.
                </p>
              )}

              <Button
                className="w-full h-14 text-base"
                onClick={() => selectedPaymentMethod && handlePayment(selectedPaymentMethod)}
                disabled={loading || !selectedPaymentMethod}
              >
                {selectedPaymentMethod === "paypal" && <Globe className="mr-2 h-5 w-5" />}
                {selectedPaymentMethod === "payoneer" && <DollarSign className="mr-2 h-5 w-5" />}
                {selectedPaymentMethod === "wallet" && <Wallet className="mr-2 h-5 w-5" />}
                {!selectedPaymentMethod && <ArrowRight className="mr-2 h-5 w-5" />}
                {selectedPaymentMethod
                  ? `Pay €${totalPrice.toFixed(0)} with ${selectedPaymentMethod === "paypal" ? "PayPal" : selectedPaymentMethod === "payoneer" ? "Payoneer" : "Wallet"}`
                  : "Choose payment method"
                }
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>

              {!hasReferralEarnings && (
                <p className="text-xs text-muted-foreground text-center">
                  <Wallet className="inline h-3 w-3 mr-1" />
                  Wallet payment is available only if you have referral earnings (commissions).
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Every plan includes a personal wallet for withdrawals and top-ups.
          </p>

          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompletePayment;
