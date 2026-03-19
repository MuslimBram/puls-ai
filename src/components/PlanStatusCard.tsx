import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useSubscription } from "@/hooks/useSubscription";
import { useConversionTracking } from "@/hooks/useConversionTracking";
import { TrialCountdown } from "@/components/TrialCountdown";
import { Link } from "react-router-dom";
import { ArrowUpRight, Lock, Sparkles, Zap } from "lucide-react";

const URGENCY_MESSAGES = [
  "Teams like yours upgrade to Growth",
  "Unlock full automation capabilities",
  "Scale your outreach with advanced features",
];

export const PlanStatusCard = () => {
  const { plan, checkLimit, checkFeature } = useFeatureGating();
  const { stripeData } = useSubscription();
  const { track } = useConversionTracking();

  const aiUsage = checkLimit("aiRepliesPerDay", stripeData?.ai_replies_today ?? 0);
  const leadsUsage = checkLimit("leadsPerMonth", stripeData?.leads_used ?? 0);

  const lockedFeatures = (["advancedCallCenter", "broadcastMessaging", "automationBuilder"] as const)
    .filter((f) => !checkFeature(f).allowed);

  const urgencyMsg = URGENCY_MESSAGES[Math.floor(Date.now() / 86400000) % URGENCY_MESSAGES.length];

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Your Plan
          </CardTitle>
          <div className="flex items-center gap-2">
            <TrialCountdown />
            <Badge>{plan?.name ?? "Free"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI usage */}
        {!aiUsage.isAtLimit && aiUsage.limit > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">AI replies today</span>
              <span className={aiUsage.isNearLimit ? "text-destructive font-medium" : "text-foreground"}>
                {aiUsage.label}
                {aiUsage.isNearLimit && " — Used " + aiUsage.percentage + "% of daily limit"}
              </span>
            </div>
            <Progress value={aiUsage.percentage} className="h-1.5" />
          </div>
        )}

        {/* Leads usage */}
        {leadsUsage.limit > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Leads this month</span>
              <span className="text-foreground">{leadsUsage.label}</span>
            </div>
            <Progress value={leadsUsage.percentage} className="h-1.5" />
          </div>
        )}

        {/* Locked features */}
        {lockedFeatures.length > 0 && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5">
            {lockedFeatures.slice(0, 3).map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span>{f.replace(/([A-Z])/g, " $1").trim()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Urgency micro-copy */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          <span>{urgencyMsg}</span>
        </div>

        <Link to="/pricing" onClick={() => track("upgrade_click", { source: "dashboard_card" })}>
          <Button size="sm" className="w-full gap-1">
            Explore plans <ArrowUpRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};
