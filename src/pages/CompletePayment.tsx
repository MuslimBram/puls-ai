import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { CreditCard, Wallet, Zap, ArrowRight, LogOut, Check } from "lucide-react";
import { useUserWallets } from "@/hooks/useUserWallet";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { PACKAGE_VARIANTS } from "@/config/plans";
import { cn } from "@/lib/utils";
import type { PlanKey, PackageVariant } from "@/types/monetization";

const CompletePayment = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { plansByKey, planOrder } = useMonetizationCatalog();
  const { data: wallets } = useUserWallets();

  // Default to user's metadata selections or fallback
  const metaPlan = user?.user_metadata?.billing_plan;
  const metaDuration = user?.user_metadata?.billing_duration;

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(
    metaPlan && ["standard", "professional", "advanced", "enterprise"].includes(metaPlan)
      ? (metaPlan as PlanKey)
      : "standard"
  );
  const [selectedDuration, setSelectedDuration] = useState<PackageVariant["type"]>(
    metaDuration && ["monthly", "3-month", "6-month", "yearly"].includes(metaDuration)
      ? (metaDuration as PackageVariant["type"])
      : "monthly"
  );
  const [loading, setLoading] = useState(false);

  const plan = plansByKey[selectedPlan];
  const variant = PACKAGE_VARIANTS.find((v) => v.type === selectedDuration) ?? PACKAGE_VARIANTS[0];
  const basePrice = plan?.monthlyPrice ?? 49;
  const discountedPrice = basePrice * (1 - variant.discountPercent / 100);

  const walletBalance = wallets?.[0]?.current_balance ?? 0;
  const canPayFromWallet = walletBalance >= discountedPrice;
  const hasReferralEarnings = walletBalance > 0;

  // Available plans (exclude enterprise for direct checkout)
  const availablePlans = planOrder.filter((k) => k !== "enterprise") as PlanKey[];

  const handleStripeCheckout = async () => {
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
      <Card className="w-full max-w-2xl">
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
          {/* Plan selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Zgjidhni Planin:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {availablePlans.map((key) => {
                const p = plansByKey[key];
                if (!p) return null;
                const isSelected = selectedPlan === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPlan(key)}
                    className={cn(
                      "relative rounded-lg border-2 p-4 text-left transition-all",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    {isSelected && (
                      <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <p className="font-semibold text-foreground">{p.name}</p>
                    <p className="text-lg font-bold text-foreground">€{p.monthlyPrice}<span className="text-xs font-normal text-muted-foreground">/muaj</span></p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Zgjidhni Kohëzgjatjen:</p>
            <div className="flex flex-wrap gap-2">
              {PACKAGE_VARIANTS.map((v) => (
                <Button
                  key={v.type}
                  type="button"
                  variant={selectedDuration === v.type ? "default" : "outline"}
                  className={cn(
                    "h-auto min-w-[110px] flex-col items-start gap-1 px-4 py-3 text-left",
                    selectedDuration === v.type && "shadow-sm"
                  )}
                  onClick={() => setSelectedDuration(v.type)}
                >
                  <span className="text-sm font-medium">{v.label}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{v.durationMonths === 1 ? "Paguaj mujore" : `${v.durationMonths}-mujore`}</span>
                    {v.discountPercent > 0 && (
                      <Badge variant="secondary" className="px-2 py-0 text-[10px]">
                        -{v.discountPercent}%
                      </Badge>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Price summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plani:</span>
              <span className="font-semibold text-foreground">{plan?.name ?? "Standard"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Kohëzgjatja:</span>
              <span className="font-semibold text-foreground">{variant.label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Çmimi:</span>
              <div className="flex items-center gap-2">
                {variant.discountPercent > 0 && (
                  <span className="text-sm text-muted-foreground line-through">€{basePrice}</span>
                )}
                <span className="font-bold text-lg text-foreground">
                  €{discountedPrice.toFixed(0)}<span className="text-xs font-normal">/muaj</span>
                </span>
              </div>
            </div>
            {variant.durationMonths > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                <span className="text-sm text-muted-foreground">Totali:</span>
                <span className="font-bold text-foreground">
                  €{(discountedPrice * variant.durationMonths).toFixed(0)}
                  <span className="text-xs font-normal text-muted-foreground"> për {variant.durationMonths} muaj</span>
                </span>
              </div>
            )}
          </div>

          {/* Stripe Checkout */}
          <Button
            className="w-full h-14 text-base"
            onClick={handleStripeCheckout}
            disabled={loading}
          >
            <CreditCard className="mr-2 h-5 w-5" />
            Paguaj me Kartë / Bankë
            <ArrowRight className="ml-auto h-4 w-4" />
          </Button>

          {/* Wallet payment */}
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
              Balanca e portofolit nuk mjafton për këtë plan. Përdorni kartë/bankë.
            </p>
          )}

          {!hasReferralEarnings && (
            <p className="text-xs text-muted-foreground text-center">
              <Wallet className="inline h-3 w-3 mr-1" />
              Pagesa nga portofoli disponohet vetëm nëse keni fituar nga referalet.
            </p>
          )}

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
