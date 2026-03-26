import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { CreditCard, Wallet, Zap, Clock, ArrowRight, LogOut } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useUserWallets } from "@/hooks/useUserWallet";

const CompletePayment = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { stripeData, selectedPlan, selectedPlanDetails } = useSubscription();
  const { wallet } = useUserWallet();
  const [loading, setLoading] = useState(false);

  const planName = selectedPlanDetails?.name ?? selectedPlan ?? "Standard";
  const planPrice = selectedPlanDetails?.monthlyPrice ?? 49;
  const walletBalance = wallet?.balance ?? 0;
  const canPayFromWallet = walletBalance >= planPrice;

  // Check if user has referral earnings (only then wallet payment is allowed)
  const hasReferralEarnings = walletBalance > 0;

  const handleStripeCheckout = async () => {
    setLoading(true);
    try {
      const billingPlan = user?.user_metadata?.billing_plan ?? "standard";
      const billingDuration = user?.user_metadata?.billing_duration ?? "monthly";

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          planKey: billingPlan,
          packageType: billingDuration === "trial" ? "monthly" : billingDuration,
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
      // Deduct from wallet and activate subscription
      const { error } = await supabase.functions.invoke("wallet-subscribe", {
        body: {
          planKey: user?.user_metadata?.billing_plan ?? "standard",
          packageType: user?.user_metadata?.billing_duration ?? "monthly",
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
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Përfundoni Pagesën</CardTitle>
          <CardDescription>
            Prova juaj 7-ditore ka përfunduar. Zgjidhni mënyrën e pagesës për të vazhduar.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Plan summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plani:</span>
              <span className="font-semibold text-foreground">{planName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Çmimi:</span>
              <span className="font-semibold text-foreground">€{planPrice}/muaj</span>
            </div>
          </div>

          {/* Stripe Checkout - always available */}
          <Button
            className="w-full h-14 text-base"
            onClick={handleStripeCheckout}
            disabled={loading}
          >
            <CreditCard className="mr-2 h-5 w-5" />
            Paguaj me Kartë / Bankë
            <ArrowRight className="ml-auto h-4 w-4" />
          </Button>

          {/* Wallet payment - only if has referral earnings */}
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
