import { ReactNode, useState } from "react";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import type { PlanFeatures } from "@/config/plans";
import { Lock } from "lucide-react";
import { UpgradeModal } from "./UpgradeModal";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";

interface FeatureLockProps {
  feature: keyof PlanFeatures;
  children: ReactNode;
  fallback?: ReactNode;
}

export const FeatureLock = ({ feature, children, fallback }: FeatureLockProps) => {
  const { checkFeature } = useFeatureGating();
  const { plansByKey } = useMonetizationCatalog();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const gate = checkFeature(feature);

  if (gate.allowed) return <>{children}</>;

  const requiredPlan = plansByKey[gate.requiredPlan];

  return (
    <>
      <div className="group relative cursor-pointer" onClick={() => setShowUpgrade(true)}>
        {fallback || (
          <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
            <Lock className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">Requires {requiredPlan?.name || gate.requiredPlan} plan</p>
            <p className="mt-1 text-xs text-muted-foreground">Upgrade to unlock this feature</p>
            <button className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Upgrade to {requiredPlan?.name || gate.requiredPlan}
            </button>
          </div>
        )}
      </div>
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} targetPlan={gate.requiredPlan} />
    </>
  );
};

export const FeatureLockBadge = ({ feature }: { feature: keyof PlanFeatures }) => {
  const { checkFeature } = useFeatureGating();
  const { plansByKey } = useMonetizationCatalog();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const gate = checkFeature(feature);

  if (gate.allowed) return null;

  return (
    <>
      <button
        onClick={() => setShowUpgrade(true)}
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/80"
      >
        <Lock className="h-3 w-3" />
        {plansByKey[gate.requiredPlan]?.name || gate.requiredPlan}
      </button>
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} targetPlan={gate.requiredPlan} />
    </>
  );
};
