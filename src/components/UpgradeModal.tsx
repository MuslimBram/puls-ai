import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { Check, Zap, ArrowRight, Loader2, Minus, Maximize2, MessageCircle } from "lucide-react";
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
  const [minimized, setMinimized] = useState(false);
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
        window.open(data.url, "_blank", "noopener,noreferrer");
        onOpenChange(false);
      } else {
        navigate("/pricing");
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

  const handleLearnWithAI = () => {
    setMinimized(false);
    window.dispatchEvent(new CustomEvent("pulse-ai:open-chat", {
      detail: { context: `Explain the ${plan?.name || target} plan and what it unlocks compared with my current plan.` },
    }));
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
    <>
      <Dialog open={open && !minimized} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-md data-[state=open]:slide-in-from-right-1/2 data-[state=closed]:slide-out-to-right-1/2"
          aria-describedby="upgrade-dialog-description"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Upgrade to {plan.name}
            </DialogTitle>
            <p id="upgrade-dialog-description" className="text-sm text-muted-foreground">
              Review what changes, choose your payment path, or ask Pulse AI to explain the plan.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">{plan.monthlyPrice.toLocaleString("en-US")} ALL</span>
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
                      <Badge variant="secondary" className="ml-auto text-xs">{feature.values[target] as string}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={handleUpgrade} disabled={loading}>
                {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Zap className="mr-1 h-4 w-4" />}
                Continue
              </Button>
              <Button variant="outline" onClick={handleViewPlans}>
                Payment options <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button size="sm" variant="ghost" onClick={handleLearnWithAI}>
                <MessageCircle className="mr-2 h-4 w-4" /> Learn more with AI
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMinimized(true)}>
                <Minus className="mr-2 h-4 w-4" /> Minimize
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {open && minimized ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
          <span className="text-sm font-medium text-foreground">Upgrade to {plan.name}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Restore upgrade dialog" onClick={() => setMinimized(false)}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Close upgrade dialog" onClick={() => onOpenChange(false)}>
            <span aria-hidden="true">×</span>
          </Button>
        </div>
      ) : null}
    </>
  );
};
