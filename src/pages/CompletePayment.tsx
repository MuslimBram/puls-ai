import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { CreditCard, Wallet, Zap, ArrowRight, LogOut, Check, Crown } from "lucide-react";
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
  { key: "trial", label: "7-ditore Provë", months: 0, discountPercent: 0 },
  { key: "monthly", label: "Mujore", months: 1, discountPercent: 0 },
  { key: "3-month", label: "3 Muaj", months: 3, discountPercent: 5 },
  { key: "6-month", label: "6 Muaj", months: 6, discountPercent: 10 },
  { key: "yearly", label: "Vjetore", months: 12, discountPercent: 15 },
];

const getDiscountedPrice = (base: number, discountPercent: number) =>
  Math.round(base * (1 - discountPercent / 100) * 100) / 100;

const CompletePayment = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: wallets } = useUserWallets();

  const metaPlan = user?.user_metadata?.billing_plan;
  const metaDuration = user?.user_metadata?.billing_duration;
  const accountType = user?.user_metadata?.account_type;
  const isFreelancerOrAmbassador = accountType === "freelancer" || accountType === "ambassador";

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(
    metaPlan && ["standard", "professional", "advanced", "enterprise"].includes(metaPlan)
      ? (metaPlan as PlanKey)
      : "standard"
  );
  const [selectedDuration, setSelectedDuration] = useState<string>(
    isFreelancerOrAmbassador ? "trial" : (metaDuration || "monthly")
  );
  const [loading, setLoading] = useState(false);

  const currentTier = PLAN_TIERS.find((t) => t.key === selectedPlan);
  const currentDuration = DURATION_OPTIONS.find((d) => d.key === selectedDuration);
  const basePrice = currentTier?.basePrice ?? 49;
  const isTrial = selectedDuration === "trial";
  const discountedPrice = isTrial ? 0 : getDiscountedPrice(basePrice, currentDuration?.discountPercent ?? 0);

  const walletBalance = wallets?.[0]?.current_balance ?? 0;
  const canPayFromWallet = walletBalance >= discountedPrice && discountedPrice > 0;
  const hasReferralEarnings = walletBalance > 0;

  const handleStripeCheckout = async () => {
    if (isTrial) {
      // Start trial directly - redirect to dashboard
      try {
        setLoading(true);
        toast.success("Provë 7-ditore e aktivizuar!");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          planKey: selectedPlan,
          packageType: selectedDuration === "monthly" ? "monthly" : selectedDuration,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Nuk u krijua lidhja e pagesës");
      }
    } catch (err: any) {
      toast.error(err.message || "Gabim gjatë krijimit të pagesës");
    }
    setLoading(false);
  };

  const handleWalletPayment = async () => {
    if (!canPayFromWallet) {
      toast.error("Balanca e portofolit nuk mjafton");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("wallet-subscribe", {
        body: {
          planKey: selectedPlan,
          packageType: selectedDuration,
        },
      });
      if (error) throw error;
      toast.success("Pagesa u krye me sukses!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Gabim gjatë pagesës nga portofoli");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Përfundoni Pagesën</CardTitle>
          <CardDescription>
            Zgjidhni planin dhe kohëzgjatjen, pastaj kryeni pagesën.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Plan selection - all 4 tiers */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Zgjidhni Planin:</p>
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
                    <span className="text-[10px] text-muted-foreground">/muaj</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration selection - all 5 options */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Zgjidhni Kohëzgjatjen:</p>
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
                            Kurseni {dur.discountPercent}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {isTrialOpt ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">€0</span>
                          <Badge className="text-[10px] px-1.5 py-0">Falas</Badge>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">€{price}/muaj</span>
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
              <span className="text-sm text-muted-foreground">Plani:</span>
              <span className="font-semibold text-foreground">{currentTier?.name ?? "Start"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Kohëzgjatja:</span>
              <span className="font-semibold text-foreground">{currentDuration?.label ?? "Mujore"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Çmimi:</span>
              <div className="flex items-center gap-2">
                {!isTrial && (currentDuration?.discountPercent ?? 0) > 0 && (
                  <span className="text-sm text-muted-foreground line-through">€{basePrice}</span>
                )}
                <span className="font-bold text-lg text-foreground">
                  {isTrial ? (
                    <><span>€0</span> <Badge className="ml-1 text-[10px]">Falas 7 ditë</Badge></>
                  ) : (
                    <>€{discountedPrice.toFixed(0)}<span className="text-xs font-normal">/muaj</span></>
                  )}
                </span>
              </div>
            </div>
            {!isTrial && (currentDuration?.months ?? 0) > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                <span className="text-sm text-muted-foreground">Totali:</span>
                <span className="font-bold text-foreground">
                  €{(discountedPrice * (currentDuration?.months ?? 1)).toFixed(0)}
                  <span className="text-xs font-normal text-muted-foreground"> për {currentDuration?.months} muaj</span>
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {isTrial ? (
            <Button
              className="w-full h-14 text-base"
              onClick={handleStripeCheckout}
              disabled={loading}
            >
              <Zap className="mr-2 h-5 w-5" />
              Fillo Provën 7-Ditore Falas
              <ArrowRight className="ml-auto h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button
                className="w-full h-14 text-base"
                onClick={handleStripeCheckout}
                disabled={loading}
              >
                <CreditCard className="mr-2 h-5 w-5" />
                Paguaj me Kartë / Bankë
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>

              {hasReferralEarnings && (
                <Button
                  variant="outline"
                  className="w-full h-14 text-base"
                  onClick={handleWalletPayment}
                  disabled={loading || !canPayFromWallet}
                >
                  <Wallet className="mr-2 h-5 w-5" />
                  Paguaj nga Portofoli
                  <Badge variant="secondary" className="ml-2">
                    €{walletBalance.toFixed(2)}
                  </Badge>
                </Button>
              )}

              {hasReferralEarnings && !canPayFromWallet && (
                <p className="text-xs text-muted-foreground text-center">
                  Balanca e portofolit nuk mjafton për këtë plan. Përdorni kartë/bankë ose PayPal/Payoneer.
                </p>
              )}

              {!hasReferralEarnings && (
                <p className="text-xs text-muted-foreground text-center">
                  <Wallet className="inline h-3 w-3 mr-1" />
                  Pagesa nga portofoli disponohet vetëm nëse keni fituar nga referalet (komisione).
                  Nuk nevojitet rimbushje nga banka.
                </p>
              )}
            </>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Secili plan përfshin një portofol personal për tërheqje dhe rimbushje.
          </p>

          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Dil nga llogaria
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompletePayment;
