import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSubscription, PLANS, PlanKey } from "@/hooks/useSubscription";
import { Check, CreditCard, Zap } from "lucide-react";
import { toast } from "@/components/ui/sonner";

const Subscription = () => {
  const { subscription, currentPlan, planDetails, isLoading } = useSubscription();

  const handleUpgrade = (plan: PlanKey) => {
    toast.info(`Upgrade to ${PLANS[plan].name} — Payment integration coming soon.`);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  const usagePercent = subscription ? Math.round((subscription.leads_used / subscription.leads_limit) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" />
              Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className="text-sm">{planDetails.name}</Badge>
              <span className="text-sm text-muted-foreground">${planDetails.price}/month</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Leads used</span>
                <span className="text-foreground">{subscription?.leads_used ?? 0} / {subscription?.leads_limit ?? planDetails.leads}</span>
              </div>
              <Progress value={usagePercent} />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Keywords limit</span>
                <p className="font-medium text-foreground">{subscription?.keywords_limit ?? planDetails.keywords}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Channels limit</span>
                <p className="font-medium text-foreground">{subscription?.channels_limit ?? planDetails.channels}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plan Comparison */}
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.entries(PLANS) as [PlanKey, typeof PLANS[PlanKey]][]).map(([key, plan]) => (
            <Card key={key} className={key === currentPlan ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {plan.keywords} keywords</div>
                  <div className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {plan.channels} channels</div>
                  <div className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {plan.leads} leads/month</div>
                  {key === "enterprise" && (
                    <>
                      <div className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Priority support</div>
                      <div className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Advanced automation</div>
                    </>
                  )}
                </div>
                {key === currentPlan ? (
                  <Button disabled className="w-full">Current Plan</Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={key === "pro" ? "default" : "outline"}
                    onClick={() => handleUpgrade(key)}
                  >
                    <Zap className="h-4 w-4 mr-1" /> Upgrade
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Billing History Placeholder */}
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
