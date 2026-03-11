import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PlanKey, PLAN_ORDER, FEATURE_COMPARISON } from "@/config/plans";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { Check, X, Zap, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlan?: PlanKey;
}

export const UpgradeModal = ({ open, onOpenChange, targetPlan }: UpgradeModalProps) => {
  const { currentPlanKey } = useFeatureGating();
  const navigate = useNavigate();
  const target = targetPlan || "professional";
  const plan = PLANS[target];
  const currentIdx = PLAN_ORDER.indexOf(currentPlanKey);
  const targetIdx = PLAN_ORDER.indexOf(target);

  const handleUpgrade = () => {
    toast.info(`Upgrade to ${plan.name} — Payment integration coming soon.`);
    onOpenChange(false);
  };

  const handleViewPlans = () => {
    onOpenChange(false);
    navigate("/pricing");
  };

  // Gather key differences
  const upgrades = FEATURE_COMPARISON.flatMap((s) =>
    s.features.filter((f) => {
      const curr = f[currentPlanKey as keyof typeof f];
      const tgt = f[target as keyof typeof f];
      return curr !== tgt && (tgt === true || (typeof tgt === "string" && typeof curr === "string"));
    }).slice(0, 3)
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
          </div>

          {upgrades.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">What you'll unlock:</p>
              {upgrades.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-foreground">{f.name}</span>
                  {typeof f[target as keyof typeof f] === "string" && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {f[target as keyof typeof f] as string}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleUpgrade}>
              <Zap className="h-4 w-4 mr-1" />
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
