import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FEATURE_COMPARISON, PLAN_ORDER, PlanKey } from "@/config/plans";
import { STRIPE_TIERS } from "@/config/stripe";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { usePlanCatalog } from "@/hooks/usePlanCatalog";
import { Check, Zap, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlan?: PlanKey;
}

export const UpgradeModal = ({ open, onOpenChange, targetPlan }: UpgradeModalProps) => {
  const { currentPlanKey } = useFeatureGating();
  const { plansByKey } = usePlanCatalog();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const target = targetPlan || "professional";
  const plan = plansByKey[target];
  const currentIdx = PLAN_ORDER.indexOf(currentPlanKey);
  const targetIdx = PLAN_ORDER.indexOf(target);

  const handleUpgrade = async () => {
    if (target === "enterprise") {
      onOpenChange(false);
      navigate("/pricing");
      return;
    }

    const tier = STRIPE_TIERS[target];
    if (!tier) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: tier.price_id },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        onOpenChange(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to start checkout");
    } finally {
      setLoading(false);
    }
  };

  const handleViewPlans = () => {
    onOpenChange(false);
    navigate("/pricing");
  };

  const upgrades = FEATURE_COMPARISON.flatMap((section) =>
    section.features
      .filter((feature) => {
        const current = feature[currentPlanKey as keyof typeof feature];
        const next = feature[target as keyof typeof feature];
        return current !== next && (next === true || (typeof next === "string" && typeof current === "string"));
      })
      .slice(0, 3)
  ).slice(0, 6);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Upgrade to {plan.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold text-foreground">${plan.monthlyPrice}</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <p className="text-sm text-muted-foreground">{plan.description}</p>
            {targetIdx > currentIdx && (
              <p className="mt-2 text-xs text-muted-foreground">Next available upgrade from your current tier.</p>
            )}
          </div>

          {upgrades.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">What you'll unlock:</p>
              {upgrades.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-foreground">{feature.name}</span>
                  {typeof feature[target as keyof typeof feature] === "string" && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {feature[target as keyof typeof feature] as string}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleUpgrade} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
              Upgrade Now
            </Button>
            <Button variant="outline" onClick={handleViewPlans}>
              Compare Plans <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
