import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PackageVariant, PlanKey } from "@/types/monetization";
import { ArrowDown, ArrowUp, Check, Crown, Loader2, Sparkles } from "lucide-react";
import {
  formatCommitmentLabel,
  formatPackageBadge,
  getDiscountedMonthlyPrice,
  getPackageSavings,
  getPackageTotalPrice,
} from "@/lib/packagePricing";
import {
  formatLimitValue,
  getPlanActionLabel,
  getPlanChangeIntent,
  type MonetizationPlan,
} from "./pricing-utils";

interface PricingPlanCardProps {
  annual: boolean;
  currentPlanKey: PlanKey;
  currentPackageType?: PackageVariant["type"];
  loading: boolean;
  onSelect: (planKey: PlanKey) => void;
  packageType: PackageVariant["type"];
  plan: MonetizationPlan;
  planOrder: PlanKey[];
}

export const PricingPlanCard = ({
  annual: _annual,
  currentPlanKey,
  currentPackageType,
  loading,
  onSelect,
  packageType,
  plan,
  planOrder,
}: PricingPlanCardProps) => {
  const intent = getPlanChangeIntent(currentPlanKey, plan.key, planOrder);
  const isCurrentSelection = currentPlanKey === plan.key && currentPackageType === packageType;
  const isSamePlanDifferentTerm = currentPlanKey === plan.key && !isCurrentSelection;
  const actionLabel = isCurrentSelection
    ? "Current term"
    : isSamePlanDifferentTerm
      ? "Select term"
      : getPlanActionLabel(intent, plan.cta);

  const displayPrice = getDiscountedMonthlyPrice(plan.monthlyPrice, packageType);
  const totalPrice = getPackageTotalPrice(plan.monthlyPrice, packageType);
  const savings = getPackageSavings(plan.monthlyPrice, packageType);
  const commitmentLabel = formatCommitmentLabel(packageType);
  const packageBadge = formatPackageBadge(packageType);
  const badgeText = plan.badgeLabel || (plan.highlighted ? "Recommended" : null);

  return (
    <Card
      className={cn(
        "relative flex h-full flex-col overflow-hidden border-border/70 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
        plan.highlighted && "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/20",
        isCurrentSelection && "border-primary/60 ring-1 ring-primary/25",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0" />

      {badgeText ? (
        <div className="absolute right-4 top-4">
          <Badge variant={plan.highlighted ? "default" : "secondary"} className="gap-1">
            {plan.highlighted ? <Crown className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            {badgeText}
          </Badge>
        </div>
      ) : null}

      <CardHeader className="space-y-4 pb-4">
        <div className="space-y-2 pr-16">
          <CardTitle className="text-xl text-foreground">{plan.name}</CardTitle>
          <CardDescription className="min-h-[3rem] text-sm leading-6">{plan.description}</CardDescription>
        </div>

        <div className="space-y-2">
          {plan.key === "enterprise" ? (
            <div className="space-y-1">
              <p className="text-4xl font-semibold tracking-tight text-foreground">Custom</p>
              <p className="text-sm text-muted-foreground">Tailored pricing, onboarding, and rollout</p>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-tight text-foreground">${displayPrice}</span>
                <span className="pb-1 text-sm text-muted-foreground">/mo</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{commitmentLabel}</Badge>
                {packageBadge ? <Badge variant="secondary">{packageBadge}</Badge> : null}
              </div>

              <p className="text-xs text-muted-foreground">
                7-day trial, then ${totalPrice} total billed for {commitmentLabel.toLowerCase()}
              </p>
              {savings > 0 ? <p className="text-xs font-medium text-primary">You save ${savings.toFixed(2)} on this term</p> : null}
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="grid gap-2 text-sm text-foreground/90">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            <span>{formatLimitValue(plan.limits.socialProfiles, "social profiles")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            <span>{formatLimitValue(plan.limits.channels, "channels")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            <span>{formatLimitValue(plan.limits.aiRepliesPerDay, "AI replies / day")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            <span>{formatLimitValue(plan.limits.teamMembers, "team members")}</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Support:</span> {plan.support}
        </div>

        <Button
          className="mt-auto w-full"
          variant={plan.highlighted || intent === "upgrade" || isSamePlanDifferentTerm ? "default" : "outline"}
          disabled={loading || isCurrentSelection}
          onClick={() => onSelect(plan.key)}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {!loading && intent === "upgrade" && !isSamePlanDifferentTerm ? <ArrowUp className="mr-2 h-4 w-4" /> : null}
          {!loading && intent === "downgrade" ? <ArrowDown className="mr-2 h-4 w-4" /> : null}
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
};