import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useDailySnapshots } from "@/hooks/useOperationalIntelligence";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  BarChart3,
  Zap,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ShieldAlert,
  Brain,
} from "lucide-react";
import { format } from "date-fns";

const formatDelta = (value: number) => {
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${value}%`;
};

const calculatePercentDelta = (current: number, previous: number) => {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return 100;
  return Math.round(((current - previous) / previous) * 100);
};

export const HistoricalTrends = () => {
  const [days, setDays] = useState(30);
  const { data: snapshots, isLoading } = useDailySnapshots(days);

  const trendData = useMemo(() => {
    const mapped = (snapshots ?? []).map((s: any) => {
      const exec = s.executive_summary ?? {};
      const funnel = s.funnel_metrics ?? {};
      const ai = s.ai_metrics ?? {};

      const totalAI = ai?.total_ai_conversations ?? 0;
      const autoReplied = ai?.auto_replied ?? 0;
      const aiRate = totalAI > 0 ? Math.round((autoReplied / totalAI) * 100) : 0;

      return {
        date: format(new Date(s.snapshot_date), "MMM d"),
        rawDate: s.snapshot_date,
        leads: exec.leads_today ?? 0,
        revenue: Math.round((exec.revenue_potential_30d ?? 0) / 1000),
        revenueRaw: exec.revenue_potential_30d ?? 0,
        openConvos: exec.open_conversations ?? 0,
        slaBreaches: exec.sla_breaches_active ?? 0,
        churnAlerts: exec.churn_risk_alerts ?? 0,
        activeCampaigns: exec.active_campaigns ?? 0,
        deals: funnel?.deals ?? 0,
        won: funnel?.won ?? 0,
        aiReplies: autoReplied,
        totalAI,
        aiRate,
      };
    });

    const first = mapped[0];
    const last = mapped[mapped.length - 1];

    const summary = first && last
      ? {
          leadsDelta: calculatePercentDelta(last.leads, first.leads),
          revenueDelta: calculatePercentDelta(last.revenueRaw, first.revenueRaw),
          aiRateDelta: calculatePercentDelta(last.aiRate, first.aiRate),
          queueDelta: calculatePercentDelta(last.openConvos, first.openConvos),
          latest: last,
        }
      : null;

    return { mapped, summary };
  }, [snapshots]);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading trends…</div>;
  }

  if (!trendData.mapped.length) {
    return <div className="py-8 text-center text-muted-foreground">No historical data yet. Snapshots are collected daily.</div>;
  }

  const latest = trendData.summary?.latest;
  const trendSignals = [
    {
      label: "Lead momentum",
      value: latest?.leads ?? 0,
      delta: trendData.summary?.leadsDelta ?? 0,
      icon: TrendingUp,
    },
    {
      label: "Revenue outlook",
      value: `$${Math.round((latest?.revenueRaw ?? 0)).toLocaleString()}`,
      delta: trendData.summary?.revenueDelta ?? 0,
      icon: BarChart3,
    },
    {
      label: "AI adoption",
      value: `${latest?.aiRate ?? 0}%`,
      delta: trendData.summary?.aiRateDelta ?? 0,
      icon: Brain,
    },
    {
      label: "Open queue",
      value: latest?.openConvos ?? 0,
      delta: trendData.summary?.queueDelta ?? 0,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <TrendingUp className="h-5 w-5 text-primary" /> Historical Trends
          </h3>
          <p className="text-xs text-muted-foreground">
            Daily snapshots of leads, revenue outlook, operational pressure, and AI activity.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(+v)}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="14">14 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {trendSignals.map((signal) => {
          const TrendIcon = signal.delta >= 0 ? ArrowUpRight : ArrowDownRight;
          return (
            <Card key={signal.label}>
              <CardContent className="pt-5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <signal.icon className="h-4 w-4 text-primary" />
                    <span className="text-xs">{signal.label}</span>
                  </div>
                  <Badge variant={signal.delta < 0 ? "outline" : "secondary"} className="gap-1 text-xs">
                    <TrendIcon className={`h-3 w-3 ${signal.delta < 0 ? "text-destructive" : "text-primary"}`} />
                    {formatDelta(signal.delta)}
                  </Badge>
                </div>
                <p className="text-2xl font-bold text-foreground">{signal.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Lead & Revenue Direction
            </CardTitle>
            <CardDescription>Track whether demand creation and revenue potential are rising together.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData.mapped}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area yAxisId="left" type="monotone" dataKey="leads" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.14)" strokeWidth={2} name="Leads" />
                <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name="Revenue potential (k$)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Trend Signals
            </CardTitle>
            <CardDescription>Latest snapshot interpretation based on recent daily movement.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Current read</p>
              <p className="mt-2 text-sm text-foreground">
                {latest && latest.slaBreaches > 0
                  ? `Operational pressure is elevated with ${latest.slaBreaches} active SLA breaches.`
                  : latest && latest.leads > 0
                    ? `Lead flow is active with ${latest.leads} leads in the latest snapshot.`
                    : "Demand signals are still light in the latest snapshot."}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <span className="text-sm text-muted-foreground">Churn alerts</span>
                <Badge variant={(latest?.churnAlerts ?? 0) > 0 ? "secondary" : "outline"}>{latest?.churnAlerts ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <span className="text-sm text-muted-foreground">SLA breaches</span>
                <Badge variant={(latest?.slaBreaches ?? 0) > 0 ? "destructive" : "outline"}>{latest?.slaBreaches ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <span className="text-sm text-muted-foreground">Active campaigns</span>
                <Badge variant="outline">{latest?.activeCampaigns ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <span className="text-sm text-muted-foreground">Auto-reply rate</span>
                <Badge variant={(latest?.aiRate ?? 0) >= 50 ? "secondary" : "outline"}>{latest?.aiRate ?? 0}%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Queue Pressure vs SLA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData.mapped}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="openConvos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Open conversations" />
                <Line type="monotone" dataKey="slaBreaches" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="SLA breaches" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" /> AI Activity Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData.mapped}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="totalAI" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted) / 0.28)" strokeWidth={1.5} name="Total AI" />
                <Area type="monotone" dataKey="aiReplies" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} name="Auto replied" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> Snapshot Timeline
          </CardTitle>
          <CardDescription>The latest daily records across demand, risk, and execution.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {trendData.mapped.slice(-7).reverse().map((item) => (
              <div key={item.rawDate} className="grid grid-cols-[120px_1fr] gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.date}</p>
                  <p className="text-xs text-muted-foreground">{item.rawDate}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{item.leads} leads</Badge>
                  <Badge variant="outline">${item.revenue}k revenue</Badge>
                  <Badge variant="outline">{item.openConvos} open</Badge>
                  <Badge variant={item.slaBreaches > 0 ? "destructive" : "outline"}>{item.slaBreaches} SLA</Badge>
                  <Badge variant={(item.aiRate ?? 0) >= 50 ? "secondary" : "outline"}>{item.aiRate}% AI rate</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
