import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDeepAnalytics } from "@/hooks/useDeepAnalytics";
import { useConversionTracking } from "@/hooks/useConversionTracking";
import { Link } from "react-router-dom";
import { DollarSign, Lightbulb, TrendingUp, Zap } from "lucide-react";

interface Opportunity {
  title: string;
  description: string;
  action: string;
  href: string;
  priority: "high" | "medium" | "low";
}

export const RevenueOpportunities = () => {
  const metrics = useDeepAnalytics("7d");
  const { track } = useConversionTracking();

  const opportunities: Opportunity[] = [];

  if (metrics.hotLeads > 0) {
    opportunities.push({
      title: "Follow up on hot leads",
      description: `${metrics.hotLeads} high-intent leads haven't been contacted. Estimated pipeline: $${metrics.predictedPipelineValue.toLocaleString()}.`,
      action: "View leads",
      href: "/leads",
      priority: "high",
    });
  }

  if (metrics.avgResponseMin > 30) {
    opportunities.push({
      title: "Speed up response time",
      description: `Average response is ${Math.round(metrics.avgResponseMin)} minutes. Reducing to <15min can increase conversion by 35%.`,
      action: "Open inbox",
      href: "/inbox",
      priority: "high",
    });
  }

  if (metrics.autoFailed > 0) {
    opportunities.push({
      title: "Fix failing automations",
      description: `${metrics.autoFailed} automations failed this week, potentially missing follow-up opportunities.`,
      action: "Check automations",
      href: "/automations",
      priority: "medium",
    });
  }

  if (metrics.totalLeads > 5 && metrics.scoredLeadCoverage < 50) {
    opportunities.push({
      title: "Enable AI lead scoring",
      description: `Only ${metrics.scoredLeadCoverage}% of leads are scored. Full scoring helps prioritize the best opportunities.`,
      action: "View analytics",
      href: "/analytics",
      priority: "medium",
    });
  }

  // Contextual upgrade suggestions
  if (metrics.totalLeads > 20) {
    opportunities.push({
      title: "Scale with broadcast campaigns",
      description: "Your lead volume supports broadcast outreach. Upgrade to run targeted campaigns at scale.",
      action: "Explore plans",
      href: "/pricing",
      priority: "low",
    });
  }

  if (opportunities.length === 0) return null;

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  opportunities.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4 text-primary" />
          Revenue Opportunities
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {opportunities.slice(0, 4).map((opp) => (
          <div key={opp.title} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {opp.priority === "high" ? (
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : opp.priority === "medium" ? (
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                ) : (
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{opp.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{opp.description}</p>
                </div>
              </div>
              <Badge
                variant={opp.priority === "high" ? "default" : "secondary"}
                className="shrink-0 text-[10px]"
              >
                {opp.priority}
              </Badge>
            </div>
            <Link
              to={opp.href}
              onClick={() => track("suggestion_accepted", { title: opp.title })}
            >
              <Button size="sm" variant="ghost" className="mt-2 h-7 px-0 text-xs text-primary">
                {opp.action} →
              </Button>
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
