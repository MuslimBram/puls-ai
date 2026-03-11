import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UsageIndicator } from "@/components/UsageIndicator";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useLeads } from "@/hooks/useLeads";
import { useChannels } from "@/hooks/useChannels";
import { useKeywords } from "@/hooks/useKeywords";
import { PLANS, PLAN_ORDER, PlanKey } from "@/config/plans";
import { CreditCard, Zap, Crown, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";

const Subscription = () => {
  const { plan, currentPlanKey, checkLimit, subscription } = useFeatureGating();
  const { leads } = useLeads();
  const { channels } = useChannels();
  const { keywords } = useKeywords();
  const navigate = useNavigate();

  const handleUpgrade = (target: PlanKey) => {
    if (target === "enterprise") {
      navigate("/pricing");
      return;
    }
    toast.info(`Upgrade to ${PLANS[target].name} — Payment integration coming soon.`);
  };

  const leadsUsage = checkLimit("leadsPerMonth", subscription?.leads_used ?? (leads ?? []).length);
  const channelsUsage = checkLimit("channels", (channels ?? []).length);
  const keywordsUsage = checkLimit("keywords", (keywords ?? []).length);

  return (
    <DashboardLayout>
      <div className="space-y-6">
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
              <span className="text-sm text-muted-foreground">
                ${plan.monthlyPrice}/month
              </span>
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

            <Button variant="outline" onClick={() => navigate("/pricing")} className="mt-2">
              View All Plans <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* Quick Plan Comparison */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const p = PLANS[key];
            const isCurrent = currentPlanKey === key;
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
                  ) : (
                    <Button
                      className="w-full"
                      size="sm"
                      variant={p.highlighted ? "default" : "outline"}
                      onClick={() => handleUpgrade(key)}
                    >
                      <Zap className="h-4 w-4 mr-1" /> {p.cta}
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
            <CardTitle className="text-lg">Billing History</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="py-6 text-center text-sm text-muted-foreground">
              No billing history yet. Payment integration coming soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Subscription;
