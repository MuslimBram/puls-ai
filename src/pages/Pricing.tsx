import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PricingPlanCard } from "@/components/pricing/PricingPlanCard";
import { PricingComparison } from "@/components/pricing/PricingComparison";
import { PricingDurationSelector } from "@/components/pricing/PricingDurationSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useMonetizationCatalog, useEnterpriseLeadSubmission } from "@/hooks/useMonetizationCatalog";
import { useSubscription } from "@/hooks/useSubscription";
import { getPackageVariant } from "@/lib/packagePricing";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Building2, Heart, Loader2, Mail, ShieldCheck } from "lucide-react";
import { getPlanChangeIntent } from "@/components/pricing/pricing-utils";
import type { PackageVariant, PlanKey } from "@/types/monetization";

const Pricing = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [packageType, setPackageType] = useState<PackageVariant["type"]>("monthly");
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    companyName: "",
    phone: "",
    teamSize: "",
    message: "",
  });

  const { currentPlanKey } = useFeatureGating();
  const { stripeData, refetchStripe } = useSubscription();
  const { plans, plansByKey, planOrder, comparisonSections, donations, isLoading } = useMonetizationCatalog();
  const enterpriseLead = useEnterpriseLeadSubmission();
  const currentPackageType = ((stripeData?.package_type as PackageVariant["type"] | undefined) ?? "monthly");
  const selectedVariant = getPackageVariant(packageType);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (!checkout) return;

    if (checkout === "success") {
      toast.success("Checkout completed successfully.");
      refetchStripe();
    } else if (checkout === "canceled") {
      toast.info("Checkout was canceled.");
    }

    const params = new URLSearchParams(searchParams);
    params.delete("checkout");
    params.delete("plan");
    params.delete("type");
    const cleaned = params.toString();
    navigate(cleaned ? `?${cleaned}` : "/pricing", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const heroStats = useMemo(
    () => [
      `${plans.length} active plans`,
      `${comparisonSections.length} comparison sections`,
      `7-day trial + ${selectedVariant.label.toLowerCase()} term`,
    ],
    [plans.length, comparisonSections.length, selectedVariant.label],
  );

  const openBillingPortal = async () => {
    const { data, error } = await supabase.functions.invoke("customer-portal");
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, "_blank", "noopener,noreferrer");
      return;
    }
    throw new Error("Billing portal unavailable");
  };

  const handlePlanAction = async (planKey: PlanKey) => {
    const intent = getPlanChangeIntent(currentPlanKey, planKey, planOrder);
    const isCurrentExactSelection = currentPlanKey === planKey && currentPackageType === packageType;

    if (isCurrentExactSelection) return;
    if (planKey === "enterprise") {
      setEnterpriseOpen(true);
      return;
    }

    setLoadingPlan(planKey);
    try {
      if (intent === "downgrade" && stripeData?.subscribed && currentPlanKey !== planKey) {
        await openBillingPortal();
        toast.success("Open billing to manage your downgrade.");
        return;
      }

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
      toast.error(error.message || "Failed to continue to checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleDonation = async (donationType: "donation_once" | "donation_monthly") => {
    const donation = donations.find((item) => item.plan_key === donationType);
    setLoadingPlan(donationType);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          donationAmount: Number(donation?.monthly_price ?? 5),
          donationRecurring: donationType === "donation_monthly",
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        return;
      }
      throw new Error("Checkout URL missing");
    } catch (error: any) {
      toast.error(error.message || "Failed to start donation checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleEnterpriseSubmit = async () => {
    if (!contactForm.email.trim()) {
      toast.error("Email is required.");
      return;
    }

    try {
      await enterpriseLead.mutateAsync(contactForm);
      setEnterpriseOpen(false);
      setContactForm({ name: "", email: "", companyName: "", phone: "", teamSize: "", message: "" });
    } catch {
      return;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-6">
        <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-background via-muted/20 to-primary/10">
          <div className="grid gap-8 px-6 py-10 md:px-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-12 lg:py-14">
            <div className="space-y-6">
              <Badge variant="secondary" className="w-fit">Monetization Phase 3</Badge>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                  Choose a plan, then lock your term.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                  Every paid plan starts with a 7-day trial, then continues on the commitment you choose below with the correct savings applied.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {heroStats.map((stat) => (
                  <Badge key={stat} variant="outline" className="rounded-full px-3 py-1 text-xs">
                    {stat}
                  </Badge>
                ))}
              </div>
            </div>

            <Card className="border-border/60 bg-card/85 shadow-xl backdrop-blur-sm">
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Commitment term</p>
                  <p className="text-xs text-muted-foreground">Longer terms unlock 5%, 10%, and 20% savings while keeping the same plan entitlements.</p>
                </div>

                <PricingDurationSelector value={packageType} onChange={setPackageType} />

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current tier</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{plansByKey[currentPlanKey]?.name ?? currentPlanKey}</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current term</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{getPackageVariant(currentPackageType).label}</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{stripeData?.status_label ?? stripeData?.status ?? "none"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <PricingPlanCard
              key={plan.key}
              annual={false}
              currentPlanKey={currentPlanKey}
              currentPackageType={currentPackageType}
              loading={loadingPlan === plan.key}
              onSelect={handlePlanAction}
              packageType={packageType}
              plan={plan}
              planOrder={planOrder}
            />
          ))}
        </section>

        <section>
          <PricingComparison
            comparisonSections={comparisonSections}
            currentPlanKey={currentPlanKey}
            planOrder={planOrder}
            plansByKey={plansByKey}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/60 bg-card/85">
            <CardContent className="flex h-full flex-col gap-5 p-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-foreground">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Enterprise pipeline</h2>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Enterprise requests persist to the backend, notify admins, and surface inside the admin dashboard for follow-up.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Persistence</p>
                  <p className="mt-2 text-sm font-medium text-foreground">Stored in enterprise leads</p>
                </div>
                <div className="rounded-2xl border border-border/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Visibility</p>
                  <p className="mt-2 text-sm font-medium text-foreground">Admin panel + notifications</p>
                </div>
                <div className="rounded-2xl border border-border/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Follow-up</p>
                  <p className="mt-2 text-sm font-medium text-foreground">Audit log created automatically</p>
                </div>
              </div>

              <Button className="w-full sm:w-fit" onClick={() => setEnterpriseOpen(true)}>
                <Mail className="mr-2 h-4 w-4" /> Contact enterprise sales
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
            <CardContent className="flex h-full flex-col gap-5 p-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-foreground">
                  <Heart className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Support the product</h2>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Optional one-time or recurring support checkout stays available without affecting plan entitlements.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {donations.map((donation) => (
                  <Button
                    key={donation.id}
                    variant={donation.plan_key === "donation_monthly" ? "default" : "outline"}
                    disabled={loadingPlan === donation.plan_key}
                    onClick={() => handleDonation(donation.plan_key as "donation_once" | "donation_monthly")}
                  >
                    {loadingPlan === donation.plan_key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Heart className="mr-2 h-4 w-4" />}
                    {donation.donation_label || donation.plan_label} (${Number(donation.monthly_price)})
                  </Button>
                ))}
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
                Donation flows use their own checkout path and do not modify the active plan badge or subscription logic.
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Pricing QA covers trial countdowns, package terms, subscription sync refresh, downgrade handling, and media quota visibility.
        </div>
      </div>

      <Dialog open={enterpriseOpen} onOpenChange={setEnterpriseOpen}>
        <DialogContent aria-describedby="enterprise-dialog-desc">
          <DialogHeader>
            <DialogTitle>Enterprise sales request</DialogTitle>
            <p id="enterprise-dialog-desc" className="text-sm text-muted-foreground">Fill in your details and we'll get back to you about enterprise pricing.</p>
          </DialogHeader>

          <div className="grid gap-3">
            <Input placeholder="Your name" value={contactForm.name} onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))} />
            <Input placeholder="Work email" type="email" value={contactForm.email} onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))} />
            <Input placeholder="Company" value={contactForm.companyName} onChange={(e) => setContactForm((prev) => ({ ...prev, companyName: e.target.value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Phone" value={contactForm.phone} onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))} />
              <Input placeholder="Team size" value={contactForm.teamSize} onChange={(e) => setContactForm((prev) => ({ ...prev, teamSize: e.target.value }))} />
            </div>
            <Textarea placeholder="Tell us about rollout, seats, compliance, or support needs" rows={5} value={contactForm.message} onChange={(e) => setContactForm((prev) => ({ ...prev, message: e.target.value }))} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnterpriseOpen(false)}>Cancel</Button>
            <Button onClick={handleEnterpriseSubmit} disabled={enterpriseLead.isPending || isLoading}>
              {enterpriseLead.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Pricing;
