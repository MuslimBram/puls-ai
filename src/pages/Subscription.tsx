import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UsageIndicator } from "@/components/UsageIndicator";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useSubscription } from "@/hooks/useSubscription";
import { useLeads } from "@/hooks/useLeads";
import { useChannels } from "@/hooks/useChannels";
import { useKeywords } from "@/hooks/useKeywords";
import { PLANS, PLAN_ORDER, PlanKey } from "@/config/plans";
import { STRIPE_TIERS } from "@/config/stripe";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Zap, Crown, ArrowRight, ExternalLink, Loader2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";

const Subscription = () => {
  const { plan, currentPlanKey, checkLimit } = useFeatureGating();
  const { subscription, stripeData, refetchStripe } = useSubscription();
  const { leads } = useLeads();
  const { channels } = useChannels();
  const { keywords } = useKeywords();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<PlanKey | null>(null);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast.success("Subscription activated! Welcome to your new plan.");
      refetchStripe();
    }
  }, [searchParams, refetchStripe]);

  const leadsUsage = checkLimit("leadsPerMonth", subscription?.leads_used ?? (leads ?? []).length);
  const channelsUsage = checkLimit("channels", (channels ?? []).length);
  const keywordsUsage = checkLimit("keywords", (keywords ?? []).length);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleUpgrade = async (target: PlanKey) => {
    if (target === "enterprise") {
      navigate("/pricing");
      return;
    }
    if (target === "standard") return;

    const tier = STRIPE_TIERS[target as Exclude<PlanKey, "standard">];
    if (!tier) return;

    setUpgradeLoading(target);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: tier.price_id },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Failed to start checkout");
    } finally {
      setUpgradeLoading(null);
    }
  };

  const isTrial = stripeData?.status === "trialing";
  const isPastDue = stripeData?.status === "past_due";
  const isCanceling = stripeData?.cancel_at_period_end;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Status Alerts */}
        {isTrial && stripeData?.trial_end && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="flex items-center gap-3 pt-6">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Free trial active</p>
                <p className="text-xs text-muted-foreground">
                  Trial ends {format(new Date(stripeData.trial_end), "MMM d, yyyy")}. You'll be charged automatically after.
                </p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto" onClick={handleManageBilling} disabled={portalLoading}>
                Manage Trial
              </Button>
            </CardContent>
          </Card>
        )}

        {isPastDue && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="flex items-center gap-3 pt-6">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-medium text-foreground">Payment failed</p>
                <p className="text-xs text-muted-foreground">
                  Please update your payment method to keep your plan features.
                </p>
              </div>
              <Button size="sm" variant="destructive" className="ml-auto" onClick={handleManageBilling} disabled={portalLoading}>
                Update Payment
              </Button>
            </CardContent>
          </Card>
        )}

        {isCanceling && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="flex items-center gap-3 pt-6">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-foreground">Subscription canceling</p>
                <p className="text-xs text-muted-foreground">
                  Your plan will downgrade at the end of the billing period
                  {stripeData?.subscription_end && ` (${format(new Date(stripeData.subscription_end), "MMM d, yyyy")})`}.
                </p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto" onClick={handleManageBilling} disabled={portalLoading}>
                Reactivate
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" />
              Current Plan — {plan.name}
            </CardTitle>
            <CardDescription>{plan.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className="text-sm">{plan.name}</Badge>
              <span className="text-sm text-muted-foreground">${plan.monthlyPrice}/month</span>
              {stripeData?.status && (
                <Badge variant={stripeData.status === "active" ? "default" : "secondary"} className="text-xs">
                  {stripeData.status}
                </Badge>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <UsageIndicator label="Leads" current={leadsUsage.current} limit={leadsUsage.limit} />
              <UsageIndicator label="Channels" current={channelsUsage.current} limit={channelsUsage.limit} />
              <UsageIndicator label="Keywords" current={keywordsUsage.current} limit={keywordsUsage.limit} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm pt-2">
              <div>
                <span className="text-muted-foreground">AI replies/day</span>
                <p className="font-medium text-foreground">
                  {plan.limits.aiRepliesPerDay === -1 ? "Unlimited" : plan.limits.aiRepliesPerDay}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Team members</span>
                <p className="font-medium text-foreground">
                  {plan.limits.teamMembers === -1 ? "Unlimited" : plan.limits.teamMembers}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Conversation history</span>
                <p className="font-medium text-foreground">
                  {plan.limits.conversationHistoryDays === -1 ? "Unlimited" : `${plan.limits.conversationHistoryDays} days`}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Support</span>
                <p className="font-medium text-foreground">{plan.support}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate("/pricing")}>
                View All Plans <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              {stripeData?.subscribed && (
                <Button variant="outline" onClick={handleManageBilling} disabled={portalLoading}>
                  {portalLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                  Manage Billing
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Plan Comparison */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const p = PLANS[key];
            const isCurrent = currentPlanKey === key;
            const isLoading = upgradeLoading === key;
            return (
              <Card key={key} className={isCurrent ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {p.name}
                    {p.highlighted && <Crown className="h-4 w-4 text-primary" />}
                  </CardTitle>
                  <CardDescription>
                    {key === "enterprise" ? (
                      <span className="text-xl font-bold text-foreground">Custom</span>
                    ) : (
                      <>
                        <span className="text-xl font-bold text-foreground">${p.monthlyPrice}</span>
                        <span className="text-muted-foreground">/mo</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isCurrent ? (
                    <Button disabled className="w-full" size="sm">Current Plan</Button>
                  ) : key === "standard" ? (
                    <Button disabled variant="outline" className="w-full" size="sm">Free</Button>
                  ) : (
                    <Button
                      className="w-full"
                      size="sm"
                      variant={p.highlighted ? "default" : "outline"}
                      onClick={() => handleUpgrade(key)}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                      {p.cta}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Billing History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Billing & Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {stripeData?.subscribed ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Next billing date</span>
                  <span className="text-foreground font-medium">
                    {stripeData.subscription_end ? format(new Date(stripeData.subscription_end), "MMM d, yyyy") : "—"}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={handleManageBilling} disabled={portalLoading}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View Invoices & Payment Methods
                </Button>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No active subscription. Choose a plan to get started.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Subscription;
