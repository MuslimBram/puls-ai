import type { Plan, PlanKey } from "@/config/plans";

export type MonetizationPlan = Plan & {
  badgeLabel?: string | null;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
};

export const isUnlimited = (value: number) => value === -1;

export const formatLimitValue = (value: number, label: string) =>
  isUnlimited(value) ? `Unlimited ${label}` : `${value} ${label}`;

export const getPlanChangeIntent = (
  currentPlanKey: PlanKey,
  targetPlanKey: PlanKey,
  planOrder: PlanKey[],
): "current" | "upgrade" | "downgrade" | "contact" => {
  if (currentPlanKey === targetPlanKey) return "current";
  if (targetPlanKey === "enterprise") return "contact";

  const currentIndex = planOrder.indexOf(currentPlanKey);
  const targetIndex = planOrder.indexOf(targetPlanKey);

  if (currentIndex === -1 || targetIndex === -1) return "upgrade";
  return targetIndex > currentIndex ? "upgrade" : "downgrade";
};

export const getPlanActionLabel = (
  intent: ReturnType<typeof getPlanChangeIntent>,
  ctaLabel: string,
) => {
  switch (intent) {
    case "current":
      return "Current plan";
    case "downgrade":
      return "Downgrade";
    case "contact":
      return ctaLabel || "Contact sales";
    default:
      return ctaLabel || "Upgrade";
  }
};
