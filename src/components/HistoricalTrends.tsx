import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useDailySnapshots } from "@/hooks/useOperationalIntelligence";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, BarChart3, Zap, Users } from "lucide-react";
import { format } from "date-fns";

export const HistoricalTrends = () => {
  const [days, setDays] = useState(30);
  const { data: snapshots, isLoading } = useDailySnapshots(days);

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading trends…</div>;
  if (!snapshots?.length) return <div className="py-8 text-center text-muted-foreground">No historical data yet. Snapshots are collected daily.</div>;

  // Transform snapshots for charts
  const chartData = snapshots.map((s: any) => {
    const exec = s.executive_summary ?? {};
    const funnel = s.funnel_metrics ?? {};
    const ai = s.ai_metrics ?? {};
    const agent = s.agent_metrics ?? {};
    return {
      date: format(new Date(s.snapshot_date), "MMM d"),
      rawDate: s.snapshot_date,
      leads: exec.leads_today ?? 0,
      revenue: Math.round((exec.revenue_potential_30d ?? 0) / 1000),
      openConvos: exec.open_conversations ?? 0,
      slaBreaches: exec.sla_breaches_active ?? 0,
      churnAlerts: exec.churn_risk_alerts ?? 0,
      deals: funnel?.deals ?? 0,
      won: funnel?.won ?? 0,
      aiReplies: ai?.auto_replied ?? 0,
      totalAI: ai?.total_ai_conversations ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" /> Historical Trends
        </h3>
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

      <div className="grid gap-4 md:grid-cols-2">
        {/* Leads Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Leads Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="leads" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Potential */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Revenue Potential (k$)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* SLA Breaches & Open Conversations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-destructive" /> SLA Breaches & Open Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="openConvos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Open Conversations" />
                <Line type="monotone" dataKey="slaBreaches" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="SLA Breaches" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* AI Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> AI Replies Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="totalAI" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted) / 0.3)" strokeWidth={1} name="Total AI" />
                <Area type="monotone" dataKey="aiReplies" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} name="Auto-Replied" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
