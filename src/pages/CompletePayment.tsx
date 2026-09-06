import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Wallet, Zap, ArrowRight, LogOut, Check, Crown, Globe, DollarSign, Landmark, AlertCircle } from "lucide-react";
import { useUserWallets } from "@/hooks/useUserWallet";
import { useCountryCurrency } from "@/hooks/useCountryCurrency";
import { FeeDisclosure } from "@/components/FeeDisclosure";
import { ManualPaymentFlow } from "@/components/ManualPaymentFlow";
import { formatCurrency, formatALL, type SupportedCurrency } from "@/lib/currency";
import { usePricingSettings } from "@/hooks/usePricingSettings";
import { cn } from "@/lib/utils";
import type { PlanKey } from "@/types/monetization";

interface PlanTier {
  key: PlanKey;
  name: string;
  basePrice: number;          // always ALL price — for plan picker display only
  priceALL: number;           // explicit ALL price (= monthly_price, always set)
  priceEUR: number | null;    // null = not yet configured → payment blocked
  priceUSD: number | null;    // null = not yet configured → payment blocked
  highlighted?: boolean;
}

/** Return the configured payment price for a currency, or null if not set. */
function getPlanPaymentPrice(tier: PlanTier | undefined, currency: SupportedCurrency): number | null {
  if (!tier) return null;
  switch (currency) {
    case "ALL": return tier.priceALL;
    case "EUR": return tier.priceEUR;
    case "USD": return tier.priceUSD;
    default:    return null;
  }
}

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

type PaymentMethod = "paypal" | "payoneer" | "wallet" | "bank_transfer";

const CompletePayment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signOut } = useAuth();
  const { data: wallets } = useUserWallets();
  const { plans: dbPlans } = usePricingSettings();

  // Build plan tiers dynamically from pricing_settings (single source of truth).
  // Highlight the second-cheapest plan as the "recommended" tier.
  const PLAN_TIERS: PlanTier[] = useMemo(() => (dbPlans || [])
    .slice()
    .sort((a, b) => Number(a.monthly_price) - Number(b.monthly_price))
    .map((p, i) => ({
      key: p.plan_key as PlanKey,
      name: (p as any).plan_label || p.plan_key,
      basePrice: Number(p.monthly_price),                          // ALL price for display
      priceALL: Number((p as any).monthly_price_all ?? p.monthly_price), // always set
      priceEUR: (p as any).monthly_price_eur != null ? Number((p as any).monthly_price_eur) : null,
      priceUSD: (p as any).monthly_price_usd != null ? Number((p as any).monthly_price_usd) : null,
      highlighted: i === 1,
    })), [dbPlans]);

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
  const { currency: detectedCurrency, countryCode, isExplicitMatch, setCurrency } = useCountryCurrency();
  const [paymentCurrency, setPaymentCurrency] = useState<SupportedCurrency>("EUR");
  const [loading, setLoading] = useState(false);

  // Sync geo-detected currency once loaded (country routing active)
  useEffect(() => {
    if (detectedCurrency) setPaymentCurrency(detectedCurrency);
  }, [detectedCurrency]);
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
  const basePrice = currentTier?.basePrice ?? 49;  // ALL price for plan picker display
  const isTrial = selectedDuration === "trial";

  // ── CURRENCY-SAFE PRICE RESOLUTION ─────────────────────────────────────
  // paymentBasePrice is the configured price for the selected payment currency.
  // null = not yet configured → checkout is BLOCKED with an informative message.
  const paymentBasePrice: number | null = isTrial ? 0 : getPlanPaymentPrice(currentTier, paymentCurrency);
  const priceConfigured = isTrial || paymentBasePrice !== null;

  // PayPal CANNOT use ALL currency (not a supported PayPal currency).
  const paypalBlockedForALL = selectedPaymentMethod === "paypal" && paymentCurrency === "ALL";
  // ALL display price (for plan picker / duration selector labels — always in ALL)
  const discountedPrice = isTrial ? 0 : getDiscountedPrice(basePrice, currentDuration?.discountPercent ?? 0);
  // Payment price in selected currency (null if not configured)
  const discountedPaymentPrice: number | null = (isTrial || paymentBasePrice === null)
    ? (isTrial ? 0 : null)
    : getDiscountedPrice(paymentBasePrice, currentDuration?.discountPercent ?? 0);

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
        // SAFETY GUARDS
        if (paymentCurrency === "ALL") {
          toast.error("PayPal does not support ALL currency. Switch to EUR to use PayPal.");
          setLoading(false);
          return;
        }
        if (totalPrice === null) {
          toast.error(`Price not configured for ${paymentCurrency}. Please contact support.`);
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke("create-paypal-order", {
          body: {
            amount: totalPrice,
            currency: paymentCurrency,  // EUR or USD only — ALL blocked above
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

      if (method === "bank_transfer" || method === "payoneer") {
        // ManualPaymentFlow owns the configured bank, Payoneer and courier steps.
        setLoading(false);
        setSelectedPaymentMethod(method);
        return;
      }

      // Stripe fallback (disabled in Albania — will return stripe_unavailable)
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
      } else if (data?.error === "stripe_unavailable") {
        toast.info("Card payments not available. Please use Bank Transfer, Payoneer, or PayPal.");
      } else {
        toast.error("Payment link could not be created");
      }
    } catch (err: any) {
      toast.error(err.message || "Error creating payment");
    }
    setLoading(false);
  };

  // totalPrice for payment — uses payment currency price, NOT ALL price
  // null if price not configured for selected currency → blocks checkout
  const totalPrice: number | null = (discountedPaymentPrice === null)
    ? null
    : discountedPaymentPrice * (currentDuration?.months ?? 1);
  // ALL total (for display in plan picker only)
  const totalPriceALL = discountedPrice * (currentDuration?.months ?? 1);

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
                    <span className="text-lg font-semibold text-primary">{formatALL(tier.basePrice)}</span>
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
                          <span className="text-sm font-semibold text-foreground">{formatALL(0)}</span>
                          <Badge className="text-[10px] px-1.5 py-0">Free</Badge>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">{formatALL(price)}/mo</span>
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
              <span className="text-sm text-muted-foreground">Price (ALL):</span>
              <div className="flex items-center gap-2">
                {!isTrial && (currentDuration?.discountPercent ?? 0) > 0 && (
                  <span className="text-sm text-muted-foreground line-through">{formatALL(basePrice)}</span>
                )}
                <span className="font-bold text-lg text-foreground">
                  {isTrial ? (
                    <><span>0 ALL</span> <Badge className="ml-1 text-[10px]">Free 7 days</Badge></>
                  ) : (
                    <>{formatALL(discountedPrice)}<span className="text-xs font-normal">/mo</span></>
                  )}
                </span>
              </div>
            </div>
            {paymentCurrency !== "ALL" && !isTrial && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Price ({paymentCurrency}):</span>
                <span className="font-semibold text-foreground">
                  {discountedPaymentPrice !== null
                    ? <>{formatCurrency(discountedPaymentPrice, paymentCurrency)}<span className="text-xs font-normal">/mo</span></>
                    : <span className="text-amber-600 text-sm">Not configured</span>
                  }
                </span>
              </div>
            )}
            {!isTrial && (currentDuration?.months ?? 0) > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                <span className="text-sm text-muted-foreground">Total ({paymentCurrency}):</span>
                <span className="font-bold text-foreground">
                  {totalPrice !== null
                    ? <>{formatCurrency(totalPrice, paymentCurrency)}<span className="text-xs font-normal text-muted-foreground"> for {currentDuration?.months} months</span></>
                    : <span className="text-amber-600">Price not configured</span>
                  }
                </span>
              </div>
            )}
          </div>


          {/* Currency selector — user can override detected currency */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Payment Currency{countryCode ? ` (detected: ${countryCode})` : ""}
            </p>
            <div className="flex gap-2">
              {(["ALL", "EUR", "USD"] as SupportedCurrency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPaymentCurrency(c)}
                  className={cn(
                    "flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all",
                    paymentCurrency === c
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/40 text-muted-foreground"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            {!isExplicitMatch && (
              <p className="text-[11px] text-muted-foreground">
                Auto-detected from location. You can change this.
              </p>
            )}
          </div>

          {/* Price-not-configured warning block */}
          {!isTrial && !priceConfigured && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-amber-700 dark:text-amber-300">
                  Price not configured for {paymentCurrency}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Payment in {paymentCurrency} is not yet available for this plan.
                  Switch currency to ALL or EUR, or contact support.
                </p>
              </div>
            </div>
          )}

          {/* PayPal + ALL warning */}
          {paypalBlockedForALL && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>PayPal does not support ALL currency. Switch to EUR to use PayPal, or use Bank Transfer for ALL payments.</p>
            </div>
          )}

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
          ) : (selectedPaymentMethod === "bank_transfer" || selectedPaymentMethod === "payoneer") ? (
            <div className="space-y-3">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setSelectedPaymentMethod(null)}
              >
                ← Change payment method
              </Button>

              {totalPrice === null ? (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    A price is not configured for {paymentCurrency}; manual payment cannot be started yet.
                  </p>
                </div>
              ) : (
                <ManualPaymentFlow
                  planKey={selectedPlan}
                  planName={currentTier?.name ?? selectedPlan}
                  packageType={currentDuration?.key ?? "monthly"}
                  chargedCurrency={paymentCurrency}
                  chargedAmount={totalPrice}
                />
              )}
            </div>
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
                onClick={() => setSelectedPaymentMethod("bank_transfer")}
                className={cn(
                  "flex items-center gap-3 w-full rounded-lg border-2 px-4 py-3 transition-all text-left",
                  selectedPaymentMethod === "bank_transfer"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border-2",
                  selectedPaymentMethod === "bank_transfer" ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}>
                  {selectedPaymentMethod === "bank_transfer" && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <Landmark className="h-5 w-5 text-slate-600" />
                <div>
                  <span className="text-sm font-medium text-foreground">Bank Transfer / Payoneer / Courier</span>
                  <p className="text-xs text-muted-foreground">Available methods depend on verified admin configuration in ALL, EUR or USD.</p>
                </div>
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
                  <Badge variant="secondary" className="ml-auto">{formatALL(walletBalance)} ALL</Badge>
                </button>
              )}

              {hasReferralEarnings && !canPayFromWallet && selectedPaymentMethod === "wallet" && (
                <p className="text-xs text-destructive text-center">
                  Wallet balance insufficient. Choose PayPal or the manual payment option.
                </p>
              )}

              <Button
                className="w-full h-14 text-base"
                onClick={() => selectedPaymentMethod && handlePayment(selectedPaymentMethod)}
                disabled={loading || !selectedPaymentMethod || !priceConfigured || paypalBlockedForALL}
              >
                {selectedPaymentMethod === "paypal" && <Globe className="mr-2 h-5 w-5" />}
                {selectedPaymentMethod === "wallet" && <Wallet className="mr-2 h-5 w-5" />}
                {!selectedPaymentMethod && <ArrowRight className="mr-2 h-5 w-5" />}
                {selectedPaymentMethod
                  ? (totalPrice !== null
                      ? `Pay ${formatCurrency(totalPrice, paymentCurrency)} with ${selectedPaymentMethod === "paypal" ? "PayPal" : "Wallet"}`
                      : "Price not configured — select another currency")
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
