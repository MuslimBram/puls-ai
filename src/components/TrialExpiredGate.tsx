import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Clock, ShieldAlert, Zap } from "lucide-react";
import { PACKAGE_VARIANTS } from "@/config/plans";
import { differenceInDays } from "date-fns";

const PLAN_TIERS = [
  { key: "standard", name: "Start", basePrice: 49 },
  { key: "professional", name: "Growth", basePrice: 99 },
  { key: "advanced", name: "Pro", basePrice: 199 },
  { key: "enterprise", name: "Enterprise", basePrice: 399 },
];

export const TrialExpiredGate = ({ children }: { children: React.ReactNode }) => {
  const { subscription, isTrialExpired, isLoading } = useSubscription();
  const { hasRole } = useRolePermissions();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState("standard");
  const [selectedDuration, setSelectedDuration] = useState("monthly");

  if (isLoading) return <>{children}</>;
  if (hasRole("admin") || hasRole("super_admin") || hasRole("ambassador")) return <>{children}</>;

  const paymentStatus = subscription?.payment_status as string | undefined;
  const isBlocked = isTrialExpired || paymentStatus === "expired" || paymentStatus === "unpaid";

  if (!isBlocked) return <>{children}</>;

  const createdAt = subscription?.created_at ? new Date(subscription.created_at) : new Date();
  const deletionDate = new Date(createdAt);
  deletionDate.setDate(deletionDate.getDate() + 30);
  const daysRemaining = Math.max(0, differenceInDays(deletionDate, new Date()));

  const tier = PLAN_TIERS.find((t) => t.key === selectedPlan);
  const variant = PACKAGE_VARIANTS.find((v) => v.type === selectedDuration);
  const discountedPrice = tier && variant
    ? Math.round(tier.basePrice * (1 - (variant.discountPercent || 0) / 100) * 100) / 100
    : tier?.basePrice ?? 49;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-lg border-destructive/30">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <CardTitle className="text-xl">Your trial has expired</CardTitle>
          <p className="text-sm text-muted-foreground">
            To continue using the platform, choose a subscription plan.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Countdown warning */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {daysRemaining > 0
                  ? `${daysRemaining} days remaining before automatic deletion`
                  : "Your account will be deleted soon!"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                If you don't complete payment within 30 days of registration, your account is automatically deleted.
              </p>
            </div>
          </div>

          {/* Plan selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Plan</label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_TIERS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.name} — €{t.basePrice}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Duration</label>
              <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PACKAGE_VARIANTS.map((v) => (
                    <SelectItem key={v.type} value={v.type}>
                      {v.label} {v.discountPercent > 0 ? `(-${v.discountPercent}%)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Price summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Monthly price:</span>
            <span className="text-lg font-bold text-primary">€{discountedPrice}/mo</span>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={() => navigate(`/complete-payment?plan=${selectedPlan}&duration=${selectedDuration}`)}
          >
            <Zap className="h-4 w-4 mr-2" />
            Continue to Payment
          </Button>

          {/* Referral earnings hint */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">
              💰 You can earn money from referrals and pay from your wallet
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
