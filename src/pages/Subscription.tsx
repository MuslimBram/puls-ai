import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNowStrict } from "date-fns";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsageIndicator } from "@/components/UsageIndicator";
import { AIUsageDashboard } from "@/components/AIUsageDashboard";
import { BillingHistoryPanel } from "@/components/BillingHistoryPanel";
import { PricingPlanCard } from "@/components/pricing/PricingPlanCard";
import { PricingDurationSelector } from "@/components/pricing/PricingDurationSelector";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useSubscription } from "@/hooks/useSubscription";
import { useLeads } from "@/hooks/useLeads";
import { useChannels } from "@/hooks/useChannels";
import { useKeywords } from "@/hooks/useKeywords";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { getPackageVariant } from "@/lib/packagePricing";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Clock, ExternalLink, Gift, Loader2, Percent } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { getPlanChangeIntent } from "@/components/pricing/pricing-utils";
import type { PackageVariant, PlanKey } from "@/types/monetization";

const Subscription = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [portalLoading, setPortalLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState<PlanKey | null>(null);
  const [packageType, setPackageType] = useState<PackageVariant["type"]>("monthly");

  const { plan, currentPlanKey, checkLimit } = useFeatureGating();
  const { subscription, stripeData, refetchStripe, isTrialExpired } = useSubscription();
  const { plans, planOrder } = useMonetizationCatalog();
  const { leads } = useLeads();
  const { channels } = useChannels();
  const { keywords } = useKeywords();
  const currentPackageType = ((stripeData?.package_type as PackageVariant["type"] | undefined) ?? "monthly");

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (!checkout) return;

    if (checkout === "success") {
      toast.success("Subscription activated successfully.");
      refetchStripe();
    } else if (checkout === "canceled") {
      toast.info("Checkout was canceled. No changes applied.");
    }

    const params = new URLSearchParams(searchParams);
    params.delete("checkout");
    params.delete("plan");
    const cleaned = params.toString();
    navigate(cleaned ? `?${cleaned}` : "/subscription", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leadsUsage = checkLimit("leadsPerMonth", subscription?.leads_used ?? (leads ?? []).length);
  const channelsUsage = checkLimit("channels", (channels ?? []).length);
  const keywordsUsage = checkLimit("keywords", (keywords ?? []).length);

  const statusTone = useMemo(() => {
    if (stripeData?.status === "past_due" || stripeData?.status === "trial_expired") return "destructive" as const;
    if (stripeData?.status === "trialing") return "secondary" as const;
    return "default" as const;
  }, [stripeData?.status]);

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.error === "no_customer") {
        toast.info("No active subscription found. Please subscribe to a plan first.");
        navigate("/pricing");
        return;
      }
      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        return;
      }
      throw new Error("Billing portal unavailable");
    } catch (error: any) {
      toast.error(error.message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePlanAction = async (planKey: PlanKey) => {
    const intent = getPlanChangeIntent(currentPlanKey, planKey, planOrder);
    const isCurrentExactSelection = currentPlanKey === planKey && currentPackageType === packageType;
    if (isCurrentExactSelection) return;
    if (planKey === "enterprise" || (intent === "downgrade" && currentPlanKey !== planKey)) {
      await openBillingPortal();
      return;
    }

    setPlanLoading(planKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { planKey, packageType },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        return;
      }
      throw new Error("Checkout URL missing");
    } catch (error: any) {
      toast.error(error.message || "Failed to start checkout");
    } finally {
      setPlanLoading(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-6">
        {stripeData?.status === "trialing" && stripeData.trial_end ? (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <Clock className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Trial active</p>
                <p className="text-xs text-muted-foreground">
                  Ends {format(new Date(stripeData.trial_end), "MMM d, yyyy")} ({formatDistanceToNowStrict(new Date(stripeData.trial_end), { addSuffix: true })}).
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={openBillingPortal} disabled={portalLoading}>Manage trial</Button>
            </CardContent>
          </Card>
        ) : null}

        {isTrialExpired ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Trial expired</p>
                <p className="text-xs text-muted-foreground">Your selected plan is on hold until checkout is completed again.</p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => navigate("/pricing")}>Resume plan</Button>
            </CardContent>
          </Card>
        ) : null}

        {stripeData?.status === "past_due" ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Payment issue detected</p>
                <p className="text-xs text-muted-foreground">Update your billing details to avoid automatic downgrade after the grace period.</p>
              </div>
              <Button size="sm" variant="destructive" onClick={openBillingPortal} disabled={portalLoading}>Fix billing</Button>
            </CardContent>
          </Card>
        ) : null}

        {stripeData?.referral_discount ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <Gift className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  Referral discount active
                  <Badge variant="secondary"><Percent className="mr-1 h-3 w-3" />{stripeData.referral_discount.percent}% off</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {stripeData.referral_discount.months_remaining} month(s) remaining · total savings ${stripeData.referral_discount.total_savings.toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <AIUsageDashboard />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Current subscription</CardTitle>
            <CardDescription>Plan sync, trial window, package term, and billing state all read from the live monetization catalog.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{plan.name}</Badge>
              <Badge variant={statusTone}>{stripeData?.status_label ?? stripeData?.status ?? "none"}</Badge>
              <Badge variant="outline">{getPackageVariant(currentPackageType).label}</Badge>
              <span className="text-sm text-muted-foreground">${plan.monthlyPrice}/month base</span>
              {stripeData?.cancel_at_period_end ? <Badge variant="outline">Downgrade scheduled</Badge> : null}
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <p className="mb-3 text-sm font-medium text-foreground">Change commitment term</p>
              <PricingDurationSelector value={packageType} onChange={setPackageType} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <UsageIndicator label="Leads" current={leadsUsage.current} limit={leadsUsage.limit} />
              <UsageIndicator label="Channels" current={channelsUsage.current} limit={channelsUsage.limit} />
              <UsageIndicator label="Keywords" current={keywordsUsage.current} limit={keywordsUsage.limit} />
            </div>

            <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Plan expires</p>
                <p className="font-medium text-foreground">{stripeData?.package_end_at ? format(new Date(stripeData.package_end_at), "MMM d, yyyy") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Commitment</p>
                <p className="font-medium text-foreground">{stripeData?.commitment_months ? `${stripeData.commitment_months} months` : getPackageVariant(currentPackageType).label}</p>
              </div>
              <div>
                <p className="text-muted-foreground">AI replies / day</p>
                <p className="font-medium text-foreground">{plan.limits.aiRepliesPerDay === -1 ? "Unlimited" : plan.limits.aiRepliesPerDay}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Support</p>
                <p className="font-medium text-foreground">{plan.support}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/pricing")}>Compare all plans</Button>
              <Button variant="outline" onClick={openBillingPortal} disabled={portalLoading}>
                {portalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}Manage billing
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((catalogPlan) => (
            <PricingPlanCard
              key={catalogPlan.key}
              annual={false}
              currentPlanKey={currentPlanKey}
              currentPackageType={currentPackageType}
              loading={planLoading === catalogPlan.key}
              onSelect={handlePlanAction}
              packageType={packageType}
              plan={catalogPlan}
              planOrder={planOrder}
            />
          ))}
        </div>

        <Tabs defaultValue="billing">
          <TabsList>
            <TabsTrigger value="billing">Billing history</TabsTrigger>
            <TabsTrigger value="usage">Usage details</TabsTrigger>
          </TabsList>
          <TabsContent value="billing">
            <BillingHistoryPanel />
          </TabsContent>
          <TabsContent value="usage">
            <Card>
              <CardHeader>
                <CardTitle>Usage snapshot</CardTitle>
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
