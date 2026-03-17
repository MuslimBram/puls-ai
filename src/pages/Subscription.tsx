import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsageIndicator } from "@/components/UsageIndicator";
import { AIUsageDashboard } from "@/components/AIUsageDashboard";
import { BillingHistoryPanel } from "@/components/BillingHistoryPanel";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useSubscription } from "@/hooks/useSubscription";
import { useLeads } from "@/hooks/useLeads";
import { useChannels } from "@/hooks/useChannels";
import { useKeywords } from "@/hooks/useKeywords";
import { PLANS, PLAN_ORDER, PlanKey } from "@/config/plans";
import { STRIPE_TIERS } from "@/config/stripe";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Zap, Crown, ArrowRight, ExternalLink, Loader2, Clock, AlertTriangle, Gift, Percent } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

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

    const tier = STRIPE_TIERS[target];
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
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-center gap-3 pt-6">
              <AlertTriangle className="h-5 w-5 text-destructive" />
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

        {/* AI Usage */}
        <AIUsageDashboard />

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

        {/* Plan Cards - matching Pricing page design */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const p = PLANS[key];
            const isCurrent = currentPlanKey === key;
            const isLoading = upgradeLoading === key;
            return (
              <Card
                key={key}
                className={cn(
                  "relative flex flex-col",
                  p.highlighted && "border-primary shadow-lg ring-1 ring-primary/20",
                  isCurrent && "border-primary/50"
                )}
              >
                {p.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground shadow-sm">
                      <Crown className="h-3 w-3 mr-1" /> Recommended
                    </Badge>
                  </div>
                )}
                {!p.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="secondary" className="shadow-sm text-xs font-semibold">
                      Pay back guaranteed
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
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

        {/* Billing & Invoices Tabs */}
        <Tabs defaultValue="billing">
          <TabsList>
            <TabsTrigger value="billing">Billing History</TabsTrigger>
            <TabsTrigger value="usage">Usage Details</TabsTrigger>
          </TabsList>
          <TabsContent value="billing">
            <BillingHistoryPanel />
          </TabsContent>
          <TabsContent value="usage">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Current Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <UsageIndicator label="Leads" current={leadsUsage.current} limit={leadsUsage.limit} />
                  <UsageIndicator label="Channels" current={channelsUsage.current} limit={channelsUsage.limit} />
                  <UsageIndicator label="Keywords" current={keywordsUsage.current} limit={keywordsUsage.limit} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Subscription;
