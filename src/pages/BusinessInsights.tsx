import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBusinessNotifications, useHealthScores, BusinessNotification } from "@/hooks/useBusinessInsights";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Brain, RefreshCw, AlertTriangle, Info, Lightbulb, AlertCircle,
  TrendingUp, Radio, Clock, Megaphone, Zap, ChevronRight, X, Check,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const typeConfig: Record<string, { icon: any; color: string; badgeClass: string }> = {
  info: { icon: Info, color: "text-primary", badgeClass: "bg-primary/10 text-primary" },
  recommendation: { icon: Lightbulb, color: "text-yellow-600", badgeClass: "bg-yellow-500/10 text-yellow-700" },
  warning: { icon: AlertTriangle, color: "text-orange-600", badgeClass: "bg-orange-500/10 text-orange-700" },
  critical: { icon: AlertCircle, color: "text-destructive", badgeClass: "bg-destructive/10 text-destructive" },
};

const scoreLabels = [
  { key: "lead_volume_score", label: "Lead Volume", icon: TrendingUp },
  { key: "channel_activity_score", label: "Channel Activity", icon: Radio },
  { key: "response_speed_score", label: "Response Speed", icon: Clock },
  { key: "campaign_engagement_score", label: "Campaign Engagement", icon: Megaphone },
  { key: "automation_usage_score", label: "Automation Health", icon: Zap },
];

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-destructive";
};

const getProgressColor = (score: number) => {
  if (score >= 80) return "[&>div]:bg-primary";
  if (score >= 60) return "[&>div]:bg-yellow-500";
  if (score >= 40) return "[&>div]:bg-orange-500";
  return "[&>div]:bg-destructive";
};

const BusinessInsights = () => {
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const { notifications, unreadCount, markRead, markAllRead, dismiss } = useBusinessNotifications();
  const { scores, latest, isLoading, runAnalysis } = useHealthScores();
  const [showAll, setShowAll] = useState(false);

  const trendData = scores
    .slice(0, 14)
    .reverse()
    .map((s) => ({
      date: format(parseISO(s.computed_at), "MMM d"),
      score: s.overall_score,
    }));

  const displayNotifications = showAll ? notifications : notifications.slice(0, 8);

  const handleRunAnalysis = () => {
    runAnalysis.mutate(workspace?.id);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Business Insights
          </h1>
          <Button size="sm" onClick={handleRunAnalysis} disabled={runAnalysis.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${runAnalysis.isPending ? "animate-spin" : ""}`} />
            {runAnalysis.isPending ? "Analyzing..." : "Run Analysis"}
          </Button>
        </div>

        {/* Health Score Overview */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:row-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Business Health Score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {latest ? (
                <>
                  <div className="text-center">
                    <p className={`text-5xl font-bold ${getScoreColor(latest.overall_score)}`}>
                      {latest.overall_score}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">out of 100</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last computed: {format(parseISO(latest.computed_at), "MMM d, HH:mm")}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {scoreLabels.map(({ key, label, icon: Icon }) => {
                      const val = (latest as any)[key] ?? 50;
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Icon className="h-3 w-3" /> {label}
                            </span>
                            <span className={`font-medium ${getScoreColor(val)}`}>{val}%</span>
                          </div>
                          <Progress value={val} className={`h-1.5 ${getProgressColor(val)}`} />
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No health data yet</p>
                  <Button size="sm" className="mt-2" onClick={handleRunAnalysis}>
                    Run First Analysis
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Score Trend */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Health Score Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" fill="url(#scoreGrad)" strokeWidth={2} name="Score" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Score trend will appear after multiple analyses
                </p>
              )}
            </CardContent>
          </Card>

          {/* AI Suggestions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" /> AI Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latest && latest.suggestions.length > 0 ? (
                <ul className="space-y-2">
                  {latest.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Run an analysis to get AI-powered suggestions</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Alerts & Recommendations
                {unreadCount > 0 && (
                  <Badge className="ml-2 text-xs">{unreadCount} new</Badge>
                )}
              </CardTitle>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => markAllRead.mutate()}>
                    Mark all read
                  </Button>
                )}
                {notifications.length > 8 && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
                    {showAll ? "Show less" : `Show all (${notifications.length})`}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {displayNotifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No alerts yet. Run an analysis to detect business changes.
              </p>
            ) : (
              <div className="space-y-2">
                {displayNotifications.map((n) => {
                  const config = typeConfig[n.notification_type] || typeConfig.info;
                  const Icon = config.icon;
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 rounded-lg border border-border p-3 transition-opacity ${n.is_read ? "opacity-60" : ""}`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.badgeClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          <Badge variant="secondary" className="text-xs capitalize">{n.category}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(n.created_at), "MMM d, HH:mm")}
                          </span>
                          {n.action_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 text-xs px-1.5"
                              onClick={() => navigate(n.action_url!)}
                            >
                              View <ChevronRight className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {!n.is_read && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => markRead.mutate(n.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => dismiss.mutate(n.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default BusinessInsights;
