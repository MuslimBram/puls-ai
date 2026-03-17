import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeepAnalytics, AnalyticsRange } from "@/hooks/useDeepAnalytics";
import { useScoreLeads } from "@/hooks/useAIConversationMemory";
import {
  TrendingUp, TrendingDown, ArrowRight, Target, Zap, Brain,
  DollarSign, Users, MessageSquare, RefreshCw, Download,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";

interface ExecutiveSummaryProps {
  dateRange: AnalyticsRange;
}

export const ExecutiveSummary = ({ dateRange }: ExecutiveSummaryProps) => {
  const m = useDeepAnalytics(dateRange);
  const scoreLeads = useScoreLeads();

  const highlights: { icon: React.ElementType; label: string; value: string | number; trend?: number; color: string }[] = [
    { icon: Target, label: "New Leads", value: m.totalLeads, trend: m.leadGrowth, color: "text-primary" },
    { icon: DollarSign, label: "Pipeline Value", value: `$${m.currentPipelineValue.toLocaleString()}`, color: "text-primary" },
    { icon: TrendingUp, label: "Conversion", value: `${m.conversionRate}%`, color: "text-primary" },
    { icon: MessageSquare, label: "Avg Response", value: `${m.avgResponseMin}m`, color: "text-muted-foreground" },
    { icon: Zap, label: "Automations", value: `${m.autoSuccess}/${m.autoTotal}`, color: "text-primary" },
    { icon: Brain, label: "AI Auto-Reply", value: `${m.aiAutoReplyRate}%`, color: "text-primary" },
  ];

  // Conversion funnel data
  const funnelSteps = [
    { label: "Leads", value: m.totalLeads, pct: 100 },
    { label: "Engaged", value: Math.round(m.totalLeads * 0.65), pct: 65 },
    { label: "Qualified", value: Math.round(m.totalLeads * (m.conversionRate / 100) * 2), pct: Math.round((m.conversionRate / 100) * 200) },
    { label: "Won", value: Math.round(m.totalLeads * (m.conversionRate / 100)), pct: m.conversionRate },
  ];

  const exportFullReport = () => {
    const rows = [
      ["LeadPulse Executive Report", ""],
      ["Generated", format(new Date(), "PPpp")],
      ["Period", dateRange],
      ["", ""],
      ["METRIC", "VALUE"],
      ["Total Leads", String(m.totalLeads)],
      ["Lead Growth %", `${m.leadGrowth}%`],
      ["Pipeline Value", `$${m.currentPipelineValue.toLocaleString()}`],
      ["Conversion Rate", `${m.conversionRate}%`],
      ["Avg Response Time", `${m.avgResponseMin} min`],
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
      ["CHURN RISK", ""],
      ["Risk Level", m.churnRiskLevel],
      ["Risk Score", String(m.churnScore)],
      ["Days Inactive", String(m.churnDaysInactive)],
      ["", ""],
      ["LEAD SOURCES", ""],
      ...m.leadsByChannel.map((c) => [c.name, String(c.value)]),
      ["", ""],
      ["CAMPAIGNS", ""],
      ...m.campaignPerf.map((c) => [c.name, `${c.sent} sent, ${c.deliveryRate}% delivered, ${c.openRate}% opened`]),
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
      {/* Quick Actions */}
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
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${scoreLeads.isPending ? "animate-spin" : ""}`} />
            Re-Score Leads
          </Button>
          <Button size="sm" variant="outline" onClick={exportFullReport}>
            <Download className="h-3.5 w-3.5 mr-1" /> Full Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {highlights.map((h) => (
          <Card key={h.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <h.icon className={`h-4 w-4 ${h.color}`} />
                <span className="text-xs text-muted-foreground">{h.label}</span>
              </div>
              <div className="flex items-end gap-1.5">
                <span className="text-xl font-bold text-foreground">{h.value}</span>
                {h.trend !== undefined && h.trend !== 0 && (
                  <span className={`text-xs flex items-center mb-0.5 ${h.trend > 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {h.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(h.trend)}%
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Conversion Funnel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {funnelSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2 flex-1">
                <div
                  className="flex-1 rounded-lg text-center py-3 transition-all"
                  style={{
                    background: `hsl(var(--primary) / ${0.1 + (1 - i / funnelSteps.length) * 0.25})`,
                    minHeight: `${40 + (funnelSteps.length - i) * 12}px`,
                  }}
                >
                  <p className="text-lg font-bold text-foreground">{step.value}</p>
                  <p className="text-xs text-muted-foreground">{step.label}</p>
                  {i > 0 && (
                    <Badge variant="secondary" className="text-xs mt-1">
                      {step.pct}%
                    </Badge>
                  )}
                </div>
                {i < funnelSteps.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Lead Sources + Churn Alert Side by Side */}
      <div className="grid gap-4 lg:grid-cols-2">
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
                      <div className="h-2 w-2 rounded-full bg-primary" style={{ opacity: 1 - i * 0.15 }} />
                      <span className="text-sm text-foreground">{ch.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-full bg-primary/20 w-20">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${(ch.value / Math.max(...m.leadsByChannel.map((c) => c.value))) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-foreground w-8 text-right">{ch.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No lead data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Health Indicators</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  label: "Automation Health",
                  value: m.autoTotal > 0 ? `${Math.round((m.autoSuccess / m.autoTotal) * 100)}%` : "N/A",
                  status: m.autoFailed === 0 ? "good" : m.autoFailed < 5 ? "warn" : "bad",
                },
                {
                  label: "AI Coverage",
                  value: `${m.aiAutoReplyRate}%`,
                  status: m.aiAutoReplyRate >= 60 ? "good" : m.aiAutoReplyRate >= 30 ? "warn" : "bad",
                },
                {
                  label: "Churn Risk",
                  value: m.churnRiskLevel,
                  status: m.churnRiskLevel === "low" || m.churnRiskLevel === "unknown" ? "good" : m.churnRiskLevel === "medium" ? "warn" : "bad",
                },
                {
                  label: "Response Speed",
                  value: `${m.avgResponseMin}m`,
                  status: m.avgResponseMin <= 15 ? "good" : m.avgResponseMin <= 60 ? "warn" : "bad",
                },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{item.value}</span>
                    <div className={`h-2.5 w-2.5 rounded-full ${
                      item.status === "good" ? "bg-emerald-500" :
                      item.status === "warn" ? "bg-yellow-500" :
                      "bg-destructive"
                    }`} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
