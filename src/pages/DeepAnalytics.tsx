import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeepAnalytics, AnalyticsRange } from "@/hooks/useDeepAnalytics";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import {
  Download, TrendingUp, Clock, Zap, Target, ArrowUpRight, ArrowDownRight,
  BarChart3, Send, Activity, Brain, AlertTriangle, Shield,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";
import { OperationalDashboard as OpsPanel } from "@/components/OperationalDashboard";
import { HistoricalTrends } from "@/components/HistoricalTrends";

const BusinessInsightsPage = lazy(() => import("./BusinessInsights"));

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(262 80% 50%)",
  "hsl(340 75% 55%)",
  "hsl(25 95% 53%)",
  "hsl(var(--secondary))",
];

const DeepAnalytics = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "insights" ? "insights" : "analytics";
  const [dateRange, setDateRange] = useState<AnalyticsRange>("30d");
  const m = useDeepAnalytics(dateRange);

  const exportCSV = () => {
    const rows = [
      ["Metric", "Value"],
      ["Total Leads", String(m.totalLeads)],
      ["Lead Growth %", String(m.leadGrowth)],
      ["Avg Response Time (min)", String(m.avgResponseMin)],
      ["Pipeline Value", String(m.currentPipelineValue)],
      ["Conversion Rate %", String(m.conversionRate)],
      ["Automations Run", String(m.autoTotal)],
      ["Automation Success", String(m.autoSuccess)],
      ["Automation Errors", String(m.autoFailed)],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deep-analytics-${dateRange}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  const GrowthIcon = m.leadGrowth >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <DashboardLayout>
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="analytics">Deep Analytics</TabsTrigger>
          <TabsTrigger value="trends">Historical Trends</TabsTrigger>
          <TabsTrigger value="ops">Operational Intelligence</TabsTrigger>
          <TabsTrigger value="insights">Business Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="trends">
          <HistoricalTrends />
        </TabsContent>
        <TabsContent value="ops">
          <OpsPanel />
        </TabsContent>
        <TabsContent value="analytics">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Deep Analytics</h1>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as AnalyticsRange)}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 14 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { icon: Target, label: "Total Leads", value: m.totalLeads, trend: m.leadGrowth, color: "bg-primary/10 text-primary" },
            { icon: Clock, label: "Avg Response", value: `${m.avgResponseMin}m`, color: "bg-accent/10 text-accent-foreground" },
            { icon: TrendingUp, label: "Conversion Rate", value: `${m.conversionRate}%`, color: "bg-primary/10 text-primary" },
            { icon: BarChart3, label: "Pipeline Value", value: `$${m.currentPipelineValue.toLocaleString()}`, color: "bg-secondary text-secondary-foreground" },
            { icon: Zap, label: "Automations", value: m.autoTotal, color: "bg-accent/10 text-accent-foreground" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="flex items-center gap-3 pt-6">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${kpi.color}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    {kpi.trend !== undefined && kpi.trend !== 0 && (
                      <span className={`text-xs flex items-center ${kpi.trend > 0 ? "text-green-600" : "text-destructive"}`}>
                        <GrowthIcon className="h-3 w-3" />{Math.abs(kpi.trend)}%
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Leads by Channel Trend */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-lg">Leads by Channel Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={m.channelTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} name="Total" />
                  {m.channels.slice(0, 4).map((ch, i) => (
                    <Line key={ch} type="monotone" dataKey={ch} stroke={COLORS[i + 1] || COLORS[0]} strokeWidth={1.5} dot={false} name={ch} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Pipeline Value Trend */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Pipeline Value Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={m.pipelineTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Value"]} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Leads by Channel Pie */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Lead Sources</CardTitle></CardHeader>
            <CardContent>
              {m.leadsByChannel.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie data={m.leadsByChannel} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}>
                        {m.leadsByChannel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5">
                    {m.leadsByChannel.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-foreground">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No lead data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Campaign Performance */}
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Send className="h-4 w-4" /> Campaign Performance</CardTitle></CardHeader>
            <CardContent>
              {m.campaignPerf.length > 0 ? (
                <div className="space-y-3">
                  {m.campaignPerf.slice(0, 5).map((c) => (
                    <div key={c.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground truncate">{c.name}</span>
                        <span className="text-muted-foreground">{c.sent} sent</span>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="secondary">{c.deliveryRate}% delivered</Badge>
                        <Badge variant="secondary">{c.openRate}% opened</Badge>
                        <Badge variant="secondary">{c.responses} responses</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No campaigns yet</p>
              )}
            </CardContent>
          </Card>

          {/* Automation Performance */}
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Activity className="h-4 w-4" /> Automation Performance</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-foreground">{m.autoTotal}</p>
                  <p className="text-xs text-muted-foreground">Total Runs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{m.autoSuccess}</p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-destructive">{m.autoFailed}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>
              <div className="mt-3 text-center">
                <p className="text-sm text-muted-foreground">Avg Duration: <span className="font-medium text-foreground">{m.autoAvgDuration}ms</span></p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
        </TabsContent>
        <TabsContent value="insights">
          <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
            <BusinessInsightsPage />
          </Suspense>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default DeepAnalytics;
