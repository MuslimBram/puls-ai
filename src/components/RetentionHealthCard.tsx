import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useHealthScores } from "@/hooks/useBusinessInsights";
import { useChurnRisk } from "@/hooks/useChurnRisk";
import { Activity, AlertTriangle, CheckCircle2, Loader2, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";

const statusConfig = {
  healthy: { icon: CheckCircle2, label: "Healthy", color: "text-green-600", variant: "default" as const },
  risk: { icon: TrendingDown, label: "At Risk", color: "text-yellow-600", variant: "secondary" as const },
  critical: { icon: AlertTriangle, label: "Critical", color: "text-destructive", variant: "destructive" as const },
};

export const RetentionHealthCard = () => {
  const { latest, isLoading, runAnalysis } = useHealthScores();
  const { churnRisk } = useChurnRisk();

  const score = latest?.overall_score ?? 0;
  const status = score >= 70 ? "healthy" : score >= 40 ? "risk" : "critical";
  const cfg = statusConfig[status];
  const StatusIcon = cfg.icon;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Business Health
          </CardTitle>
          <Badge variant={cfg.variant} className="gap-1">
            <StatusIcon className="h-3 w-3" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Score</span>
            <span className={`font-semibold ${cfg.color}`}>{score}/100</span>
          </div>
          <Progress value={score} className="h-2" />
        </div>

        {latest && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border/60 p-2">
              <p className="text-muted-foreground">Lead Volume</p>
              <p className="font-medium text-foreground">{latest.lead_volume_score}/100</p>
            </div>
            <div className="rounded-lg border border-border/60 p-2">
              <p className="text-muted-foreground">Channel Activity</p>
              <p className="font-medium text-foreground">{latest.channel_activity_score}/100</p>
            </div>
            <div className="rounded-lg border border-border/60 p-2">
              <p className="text-muted-foreground">Response Speed</p>
              <p className="font-medium text-foreground">{latest.response_speed_score}/100</p>
            </div>
            <div className="rounded-lg border border-border/60 p-2">
              <p className="text-muted-foreground">Automation</p>
              <p className="font-medium text-foreground">{latest.automation_usage_score}/100</p>
            </div>
          </div>
        )}

        {churnRisk && churnRisk.risk_level !== "low" && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs">
            <p className="font-medium text-destructive">Churn signals detected</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {(churnRisk.signals ?? []).slice(0, 3).map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
        )}

        {latest?.suggestions && latest.suggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">AI Suggestions</p>
            {latest.suggestions.slice(0, 3).map((s, i) => (
              <p key={i} className="text-xs text-foreground">→ {s}</p>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => runAnalysis.mutate(undefined)}
            disabled={runAnalysis.isPending}
          >
            {runAnalysis.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Refresh Analysis
          </Button>
          <Link to="/analytics" className="flex-1">
            <Button size="sm" variant="outline" className="w-full text-xs">
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};
