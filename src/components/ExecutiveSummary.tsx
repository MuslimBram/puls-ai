import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeepAnalytics, AnalyticsRange } from "@/hooks/useDeepAnalytics";
import { useExecutiveSummary } from "@/hooks/useOperationalIntelligence";
import { useScoreLeads } from "@/hooks/useAIConversationMemory";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Target,
  Zap,
  Brain,
  DollarSign,
  Users,
  MessageSquare,
  RefreshCw,
  Download,
  Sparkles,
  AlertTriangle,
  Shield,
  Activity,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";

interface ExecutiveSummaryProps {
  dateRange: AnalyticsRange;
}

export const ExecutiveSummary = ({ dateRange }: ExecutiveSummaryProps) => {
  const m = useDeepAnalytics(dateRange);
  const executive = useExecutiveSummary();
  const scoreLeads = useScoreLeads();

  const highlights: { icon: React.ElementType; label: string; value: string | number; trend?: number; color: string }[] = [
    { icon: Target, label: "New Leads", value: m.totalLeads, trend: m.leadGrowth, color: "text-primary" },
    { icon: DollarSign, label: "Pipeline Value", value: `$${m.currentPipelineValue.toLocaleString()}`, color: "text-primary" },
    { icon: Sparkles, label: "Predicted Pipeline", value: `$${m.predictedPipelineValue.toLocaleString()}`, color: "text-primary" },
    { icon: TrendingUp, label: "Conversion", value: `${m.conversionRate}%`, color: "text-primary" },
    { icon: MessageSquare, label: "Avg Response", value: `${m.avgResponseMin}m`, color: "text-muted-foreground" },
    { icon: Brain, label: "Avg AI Score", value: m.avgPredictedLeadScore, color: "text-primary" },
  ];

  const funnelSteps = [
    { label: "Leads", value: m.totalLeads, pct: 100 },
    { label: "Engaged", value: Math.round(m.totalLeads * 0.65), pct: 65 },
    { label: "Qualified", value: Math.round(m.totalLeads * (m.conversionRate / 100) * 2), pct: Math.round((m.conversionRate / 100) * 200) },
    { label: "Won", value: Math.round(m.totalLeads * (m.conversionRate / 100)), pct: m.conversionRate },
  ];

  const executiveCards = executive.data
    ? [
        { icon: Target, label: "Leads Today", value: executive.data.leads_today },
        { icon: DollarSign, label: "30d Revenue Potential", value: `$${executive.data.revenue_potential_30d.toLocaleString()}` },
        { icon: MessageSquare, label: "Open Conversations", value: executive.data.open_conversations },
        { icon: Zap, label: "Active Campaigns", value: executive.data.active_campaigns },
      ]
    : [];

  const priorityActions: { title: string; detail: string; variant: "default" | "secondary" | "destructive" | "outline" }[] = [
    executive.data?.sla_breaches_active
      ? {
          title: `Resolve ${executive.data.sla_breaches_active} SLA breach${executive.data.sla_breaches_active === 1 ? "" : "es"}`,
          detail: "Response commitments are at risk and should be handled first.",
          variant: "destructive",
        }
      : null,
    executive.data?.churn_risk_alerts
      ? {
          title: `Review ${executive.data.churn_risk_alerts} churn risk alert${executive.data.churn_risk_alerts === 1 ? "" : "s"}`,
          detail: "Retention signals have weakened and need a re-engagement play.",
          variant: "secondary",
        }
      : null,
    m.hotLeads > 0
      ? {
          title: `Prioritize ${m.hotLeads} hot lead${m.hotLeads === 1 ? "" : "s"}`,
          detail: `AI sees $${m.predictedPipelineValue.toLocaleString()} in near-term revenue potential.`,
          variant: "default",
        }
      : null,
    m.autoFailed > 0
      ? {
          title: `Fix ${m.autoFailed} failed automation run${m.autoFailed === 1 ? "" : "s"}`,
          detail: "Cleaning up automation errors will protect response speed and consistency.",
          variant: "destructive",
        }
      : null,
    m.scoredLeadCoverage < 70
      ? {
          title: "Increase AI lead scoring coverage",
          detail: `${m.scoredLeadCoverage}% of current leads are scored, so rerunning AI scoring will sharpen prioritization.`,
          variant: "outline",
        }
      : null,
  ].filter((item): item is { title: string; detail: string; variant: "default" | "secondary" | "destructive" | "outline" } => Boolean(item));

  const exportFullReport = () => {
    const rows = [
      ["Pulse AI Executive Report", ""],
      ["Generated", format(new Date(), "PPpp")],
      ["Period", dateRange],
      ["", ""],
      ["METRIC", "VALUE"],
      ["Total Leads", String(m.totalLeads)],
      ["Lead Growth %", `${m.leadGrowth}%`],
      ["Pipeline Value", `$${m.currentPipelineValue.toLocaleString()}`],
      ["Predicted Pipeline Value", `$${m.predictedPipelineValue.toLocaleString()}`],
      ["Avg AI Lead Score", String(m.avgPredictedLeadScore)],
      ["Hot Leads", String(m.hotLeads)],
      ["Scored Lead Coverage", `${m.scoredLeadCoverage}%`],
      ["Conversion Rate", `${m.conversionRate}%`],
      ["Avg Response Time", `${m.avgResponseMin} min`],
      ["", ""],
      ["TODAY SNAPSHOT", ""],
      ["Leads Today", String(executive.data?.leads_today ?? 0)],
      ["Revenue Potential 30d", `$${(executive.data?.revenue_potential_30d ?? 0).toLocaleString()}`],
      ["Open Conversations", String(executive.data?.open_conversations ?? 0)],
      ["Active Campaigns", String(executive.data?.active_campaigns ?? 0)],
      ["Churn Risk Alerts", String(executive.data?.churn_risk_alerts ?? 0)],
      ["Active SLA Breaches", String(executive.data?.sla_breaches_active ?? 0)],
      ["", ""],
      ["AUTOMATIONS", ""],
      ["Total Runs", String(m.autoTotal)],
      ["Successful", String(m.autoSuccess)],
      ["Errors", String(m.autoFailed)],
      ["Avg Duration", `${m.autoAvgDuration}ms`],
      ["", ""],
      ["AI PERFORMANCE", ""],
      ["Total AI Conversations", String(m.aiTotal)],
      ["Auto-Replied", String(m.aiAutoReplied)],
      ["Auto-Reply Rate", `${m.aiAutoReplyRate}%`],
      ["", ""],
      ["TOP PREDICTED LEADS", ""],
      ...m.topPredictedLeads.map((lead) => [lead.sourceName, `$${lead.predictedValue} | Score ${lead.score} | ${lead.status}`]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `executive-report-${dateRange}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Executive report exported");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Executive Summary</h3>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d, yyyy")} — Last {dateRange.replace("d", " days")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => scoreLeads.mutate()}
            disabled={scoreLeads.isPending}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${scoreLeads.isPending ? "animate-spin" : ""}`} />
            Re-Score Leads
          </Button>
          <Button size="sm" variant="outline" onClick={exportFullReport}>
            <Download className="mr-1 h-3.5 w-3.5" /> Full Report
          </Button>
        </div>
      </div>

      <Card className="border-primary/10 bg-gradient-to-br from-primary/5 via-background to-secondary/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Daily Executive Brief
          </CardTitle>
          <CardDescription>
            {executive.data
              ? `Today you generated ${executive.data.leads_today} leads, have $${executive.data.revenue_potential_30d.toLocaleString()} in 30-day revenue potential, and ${executive.data.open_conversations} open conversations requiring attention.`
              : "Loading today’s business pulse, revenue potential, and active operational risk signals."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {executiveCards.length > 0 ? (
              executiveCards.map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-card/80 p-4">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <item.icon className="h-4 w-4 text-primary" />
                    <span className="text-xs">{item.label}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{item.value}</p>
                </div>
              ))
            ) : (
              <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Daily executive metrics are loading.
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-border bg-card/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Priority Actions</p>
              </div>
              {priorityActions.length > 0 ? (
                <div className="space-y-2.5">
                  {priorityActions.map((item) => (
                    <div key={item.title} className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <Badge variant={item.variant}>{item.variant === "destructive" ? "Urgent" : item.variant === "default" ? "Priority" : item.variant === "secondary" ? "Watch" : "Optimize"}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No urgent actions detected right now — current signals look stable.</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Risk Snapshot</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">Churn alerts</span>
                  <Badge variant={executive.data?.churn_risk_alerts ? "secondary" : "outline"}>{executive.data?.churn_risk_alerts ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">SLA breaches</span>
                  <Badge variant={executive.data?.sla_breaches_active ? "destructive" : "outline"}>{executive.data?.sla_breaches_active ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">Automation failures</span>
                  <Badge variant={m.autoFailed > 0 ? "destructive" : "outline"}>{m.autoFailed}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">Hot leads</span>
                  <Badge variant={m.hotLeads > 0 ? "default" : "outline"}>{m.hotLeads}</Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {highlights.map((h) => (
          <Card key={h.label}>
            <CardContent className="px-4 pb-3 pt-4">
              <div className="mb-1 flex items-center gap-2">
                <h.icon className={`h-4 w-4 ${h.color}`} />
                <span className="text-xs text-muted-foreground">{h.label}</span>
              </div>
              <div className="flex items-end gap-1.5">
                <span className="text-xl font-bold text-foreground">{h.value}</span>
                {h.trend !== undefined && h.trend !== 0 && (
                  <span className={`mb-0.5 flex items-center text-xs ${h.trend > 0 ? "text-primary" : "text-destructive"}`}>
                    {h.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(h.trend)}%
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-primary" /> Conversion Funnel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {funnelSteps.map((step, i) => (
              <div key={step.label} className="flex flex-1 items-center gap-2">
                <div
                  className="flex-1 rounded-lg py-3 text-center transition-all"
                  style={{
                    background: `hsl(var(--primary) / ${0.1 + (1 - i / funnelSteps.length) * 0.25})`,
                    minHeight: `${40 + (funnelSteps.length - i) * 12}px`,
                  }}
                >
                  <p className="text-lg font-bold text-foreground">{step.value}</p>
                  <p className="text-xs text-muted-foreground">{step.label}</p>
                  {i > 0 && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {step.pct}%
                    </Badge>
                  )}
                </div>
                {i < funnelSteps.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Predictive Sales AI</CardTitle>
            <CardDescription>AI-estimated revenue potential from scored leads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Predicted Pipeline</p>
                <p className="text-lg font-bold text-foreground">${m.predictedPipelineValue.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Hot Leads</p>
                <p className="text-lg font-bold text-foreground">{m.hotLeads}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Coverage</p>
                <p className="text-lg font-bold text-foreground">{m.scoredLeadCoverage}%</p>
              </div>
            </div>
            {m.topPredictedLeads.length > 0 ? (
              <div className="space-y-2">
                {m.topPredictedLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{lead.sourceName}</p>
                      <p className="text-xs text-muted-foreground">Score {lead.score} · {lead.status}</p>
                    </div>
                    <Badge variant="secondary">${lead.predictedValue.toLocaleString()}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Run AI scoring to generate revenue predictions.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {m.leadsByChannel.length > 0 ? (
              <div className="space-y-2">
                {m.leadsByChannel.slice(0, 5).map((ch, i) => (
                  <div key={ch.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{i + 1}</span>
                      <span className="text-sm text-foreground">{ch.name}</span>
                    </div>
                    <Badge variant="outline">{ch.value}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No lead source data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
