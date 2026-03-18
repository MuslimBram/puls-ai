import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { Check, Zap, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { PlanKey } from "@/types/monetization";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlan?: PlanKey;
}

export const UpgradeModal = ({ open, onOpenChange, targetPlan }: UpgradeModalProps) => {
  const { currentPlanKey } = useFeatureGating();
  const { plansByKey, comparisonSections, planOrder } = useMonetizationCatalog();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const target = targetPlan || "professional";
  const plan = plansByKey[target];
  const currentIdx = planOrder.indexOf(currentPlanKey);
  const targetIdx = planOrder.indexOf(target);

  const handleUpgrade = async () => {
    if (target === "enterprise") {
      onOpenChange(false);
      navigate("/pricing");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { planKey: target },
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

  const upgrades = comparisonSections
    .flatMap((section) => section.rows)
    .filter((feature) => {
      const current = feature.values[currentPlanKey];
      const next = feature.values[target];
      return current !== next && (next === true || typeof next === "string");
    })
    .slice(0, 6);

  if (!plan) return null;

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
            <div className="mb-1 flex items-baseline gap-2">
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
              {upgrades.map((feature) => (
                <div key={feature.id} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-foreground">{feature.featureName}</span>
                  {typeof feature.values[target] === "string" && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {feature.values[target] as string}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleUpgrade} disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Zap className="mr-1 h-4 w-4" />}
              Upgrade now
            </Button>
            <Button variant="outline" onClick={handleViewPlans}>
              Compare plans <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
