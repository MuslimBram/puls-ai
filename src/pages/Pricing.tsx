import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PLANS, PLAN_ORDER, FEATURE_COMPARISON, PlanKey } from "@/config/plans";
import { STRIPE_TIERS } from "@/config/stripe";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Zap, HelpCircle, Crown, Mail, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";

const Pricing = () => {
  const [annual, setAnnual] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const { currentPlanKey } = useFeatureGating();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("checkout") === "canceled") {
      toast.info("Checkout was canceled.");
    }
  }, [searchParams]);

  const handleUpgrade = async (plan: PlanKey) => {
    if (plan === "enterprise") {
      setEnterpriseOpen(true);
      return;
    }
    if (plan === "standard") return;

    const tier = STRIPE_TIERS[plan as Exclude<PlanKey, "standard">];
    if (!tier) return;

    setLoadingPlan(plan);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: tier.price_id },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to start checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleEnterpriseSubmit = () => {
    if (!contactForm.email.trim()) {
      toast.error("Please enter your email.");
      return;
    }
    toast.success("Thank you! Our team will contact you within 24 hours.");
    setEnterpriseOpen(false);
    setContactForm({ name: "", email: "", message: "" });
  };

  const renderCellValue = (val: string | boolean) => {
    if (val === true) return <Check className="h-4 w-4 text-primary mx-auto" />;
    if (val === false) return <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />;
    return <span className="text-sm text-foreground">{val}</span>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-foreground">Choose Your Plan</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Scale your social engagement with the right tools. All plans include a 7-day free trial.
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className={cn("text-sm", !annual ? "text-foreground font-medium" : "text-muted-foreground")}>Monthly</span>
            <Switch checked={annual} onCheckedChange={setAnnual} />
            <span className={cn("text-sm", annual ? "text-foreground font-medium" : "text-muted-foreground")}>
              Annual
              <Badge variant="secondary" className="ml-1.5 text-xs">Save 17%</Badge>
            </span>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const plan = PLANS[key];
            const isCurrent = currentPlanKey === key;
            const price = annual ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
            const isLoading = loadingPlan === key;

            return (
              <Card
                key={key}
                className={cn(
                  "relative flex flex-col",
                  plan.highlighted && "border-primary shadow-lg ring-1 ring-primary/20",
                  isCurrent && "border-primary/50"
                )}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground shadow-sm">
                      <Crown className="h-3 w-3 mr-1" /> Recommended
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <CardDescription className="text-xs min-h-[2.5rem]">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="mb-4">
                    {key === "enterprise" ? (
                      <span className="text-2xl font-bold text-foreground">Custom</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-foreground">${price}</span>
                        <span className="text-sm text-muted-foreground">/mo</span>
                        {annual && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ${plan.annualPrice}/year billed annually
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-2 text-sm mb-4 flex-1">
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-foreground">
                        {plan.limits.socialProfiles === -1 ? "Unlimited" : plan.limits.socialProfiles} social profiles
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-foreground">
                        {plan.limits.keywords === -1 ? "Unlimited" : plan.limits.keywords} keywords
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-foreground">
                        {plan.limits.aiRepliesPerDay === -1 ? "Unlimited" : plan.limits.aiRepliesPerDay} AI replies/day
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-foreground">{plan.support} support</span>
                    </div>
                    {key !== "standard" && (
                      <div className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-foreground">7-day free trial</span>
                      </div>
                    )}
                  </div>

                  {isCurrent ? (
                    <Button disabled className="w-full">Current Plan</Button>
                  ) : key === "standard" ? (
                    <Button disabled variant="outline" className="w-full">Free Plan</Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={plan.highlighted ? "default" : "outline"}
                      onClick={() => handleUpgrade(key)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-1" />
                      )}
                      {plan.cta}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Feature Comparison</CardTitle>
            <CardDescription>Detailed breakdown of what's included in each plan.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 font-medium text-foreground sticky left-0 bg-card min-w-[200px]">Feature</th>
                  {PLAN_ORDER.map((key) => (
                    <th key={key} className={cn(
                      "text-center py-3 px-3 font-medium min-w-[120px]",
                      currentPlanKey === key ? "text-primary" : "text-foreground"
                    )}>
                      {PLANS[key].name}
                      {currentPlanKey === key && (
                        <Badge variant="secondary" className="ml-1 text-xs">Current</Badge>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_COMPARISON.map((section) => (
                  <>
                    <tr key={section.title}>
                      <td colSpan={5} className="pt-4 pb-2 px-2 font-semibold text-foreground text-xs uppercase tracking-wider">
                        {section.title}
                      </td>
                    </tr>
                    {section.features.map((feature) => (
                      <tr key={feature.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-2 sticky left-0 bg-card">
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground">{feature.name}</span>
                            {feature.tooltip && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[200px]">
                                  {feature.tooltip}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        {PLAN_ORDER.map((planKey) => (
                          <td key={planKey} className={cn(
                            "text-center py-2.5 px-3",
                            currentPlanKey === planKey && "bg-primary/5"
                          )}>
                            {renderCellValue(feature[planKey])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Enterprise Contact Modal */}
        <Dialog open={enterpriseOpen} onOpenChange={setEnterpriseOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Contact Sales — Enterprise Plan
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">Name</label>
                <Input value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@company.com" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Message</label>
                <Textarea value={contactForm.message} onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))} placeholder="Tell us about your needs..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEnterpriseOpen(false)}>Cancel</Button>
              <Button onClick={handleEnterpriseSubmit}>Send Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Pricing;
