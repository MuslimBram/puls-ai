import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeepAnalytics } from "@/hooks/useDeepAnalytics";
import { useOnboarding } from "@/hooks/useOnboarding";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  ChevronRight,
  Rocket,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

type Insight = {
  title: string;
  message: string;
  action: string;
  href: string;
  tone?: "default" | "secondary" | "destructive" | "outline";
};

export const GrowthAssistant = () => {
  const metrics = useDeepAnalytics("7d");
  const { coachTips, completionScore, isDismissed, reopen } = useOnboarding();

  const insights: Insight[] = [];
  const alerts: Insight[] = [];

  if (completionScore < 100 && !isDismissed && coachTips.length > 0) {
    const nextTip = coachTips[0];
    insights.push({
      title: "Finish setup",
      message: `${completionScore}% of your platform is ready. Completing the next setup task will improve AI output quality and lead capture.`,
      action: nextTip.action,
      href: nextTip.href,
      tone: "secondary",
    });
  }

  if (metrics.totalLeads > 0) {
    insights.push({
      title: "Lead momentum",
      message:
        metrics.leadGrowth > 0
          ? `Lead discovery is up ${metrics.leadGrowth}% this week with ${metrics.totalLeads} active leads in the current window.`
          : `You captured ${metrics.totalLeads} leads this week. Prioritize the hottest ones to improve conversion speed.`,
      action: "Review leads",
      href: "/leads",
      tone: "default",
    });
  }

  if (metrics.hotLeads > 0 || metrics.predictedPipelineValue > 0) {
    insights.push({
      title: "Revenue opportunity",
      message: `AI sees ${metrics.hotLeads} hot leads and an estimated pipeline of $${metrics.predictedPipelineValue.toLocaleString()} in the last 7 days.`,
      action: "Open analytics",
      href: "/analytics",
      tone: "default",
    });
  }

  if (metrics.avgResponseMin > 60) {
    alerts.push({
      title: "Slow response time",
      message: `Average first response time is ${metrics.avgResponseMin} minutes. Faster replies can improve lead qualification and close rate.`,
      action: "Open inbox",
      href: "/inbox",
      tone: "destructive",
    });
  }

  if (metrics.autoFailed > 0) {
    alerts.push({
      title: "Automation failures",
      message: `${metrics.autoFailed} automation run${metrics.autoFailed === 1 ? "" : "s"} failed this week and may be blocking follow-ups or lead routing.`,
      action: "Check automations",
      href: "/automations",
      tone: "destructive",
    });
  }

  if (metrics.scoredLeadCoverage > 0 && metrics.scoredLeadCoverage < 70) {
    alerts.push({
      title: "Low AI coverage",
      message: `Only ${metrics.scoredLeadCoverage}% of recent leads have AI scoring. Expanding scoring coverage will sharpen prioritization.`,
      action: "View executive summary",
      href: "/analytics?tab=executive",
      tone: "outline",
    });
  }

  if (metrics.churnScore >= 70) {
    alerts.push({
      title: "Churn risk detected",
      message: `Retention risk is elevated at ${metrics.churnScore}%. Re-engage inactive customers before demand drops further.`,
      action: "Open subscription",
      href: "/subscription",
      tone: "destructive",
    });
  }

  const visibleInsights = insights.slice(0, 3);
  const visibleAlerts = alerts.slice(0, 2);

  if (!metrics.isLoading && visibleInsights.length === 0 && visibleAlerts.length === 0 && completionScore === 100) {
    return null;
  }

  return (
    <Card className="border-primary/10 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Growth Assistant
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Daily AI guidance based on lead flow, engagement speed, automation health, and setup readiness.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {completionScore < 100 && (
              <Badge variant="secondary" className="text-xs">
                Setup {completionScore}%
              </Badge>
            )}
            {metrics.hotLeads > 0 && (
              <Badge variant="default" className="text-xs">
                {metrics.hotLeads} hot leads
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Insights</p>
            </div>
            {metrics.isLoading ? (
              <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                Building today&apos;s growth guidance...
              </div>
            ) : (
              visibleInsights.map((insight) => (
                <div key={insight.title} className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{insight.message}</p>
                    </div>
                    <Badge variant={insight.tone ?? "secondary"} className="shrink-0 text-[10px] uppercase">
                      AI
                    </Badge>
                  </div>
                  <Link to={insight.href}>
                    <Button size="sm" variant="outline" className="mt-1 h-8 gap-1 text-xs">
                      {insight.action}
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Alerts</p>
            </div>
            {visibleAlerts.length > 0 ? (
              visibleAlerts.map((alert) => (
                <div key={alert.title} className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                        <Badge variant={alert.tone ?? "destructive"} className="text-[10px] uppercase">
                          Attention
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                      <Link to={alert.href}>
                        <Button size="sm" variant="ghost" className="mt-2 h-7 px-0 text-xs text-primary hover:text-primary">
                          {alert.action}
                          <ChevronRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/60 p-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">No urgent blockers</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your current engagement and automation signals look stable for the last 7 days.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isDismissed && completionScore < 100 && (
              <div className="rounded-xl border border-border bg-card/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Rocket className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Setup wizard hidden</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Reopen the setup flow to complete the remaining growth foundations.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => reopen.mutate()}>
                    Reopen
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
