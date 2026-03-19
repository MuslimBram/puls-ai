import { useState } from "react";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useConversionTracking } from "@/hooks/useConversionTracking";
import { UpgradeModal } from "@/components/UpgradeModal";
import type { PlanFeatures, PlanKey } from "@/types/monetization";

interface UpgradePaywallProps {
  feature?: keyof PlanFeatures;
  limitKey?: "channels" | "keywords" | "aiRepliesPerDay" | "teamMembers" | "leadsPerMonth" | "socialProfiles" | "automationRules";
  currentUsage?: number;
  children: React.ReactNode;
  reason?: string;
}

export const UpgradePaywall = ({ feature, limitKey, currentUsage = 0, children, reason }: UpgradePaywallProps) => {
  const { checkFeature, checkLimit } = useFeatureGating();
  const { track } = useConversionTracking();
  const [showUpgrade, setShowUpgrade] = useState(false);

  let blocked = false;
  let targetPlan: PlanKey | undefined;

  if (feature) {
    const gate = checkFeature(feature);
    if (!gate.allowed) {
      blocked = true;
      targetPlan = gate.requiredPlan;
    }
  }

  if (limitKey) {
    const usage = checkLimit(limitKey, currentUsage);
    if (usage.isAtLimit) {
      blocked = true;
    }
  }

  if (!blocked) return <>{children}</>;

  const handleClick = () => {
    track("paywall_trigger", { feature, limitKey, reason });
    setShowUpgrade(true);
  };

  return (
    <>
      <div onClick={handleClick} className="cursor-pointer">
        {children}
      </div>
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} targetPlan={targetPlan} />
    </>
  );
};
