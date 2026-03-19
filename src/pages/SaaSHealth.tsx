import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSaaSMetrics, useCohortRetention, usePlatformHealth } from "@/hooks/useSaaSHealth";
import { Activity, Users, DollarSign, TrendingUp, Shield, Server, BarChart3, PieChart, HeartPulse, Layers } from "lucide-react";

const SaaSHealth = () => {
  const { data: metrics = [] } = useSaaSMetrics();
  const { data: cohorts = [] } = useCohortRetention();
  const { data: healthChecks = [] } = usePlatformHealth();

  const latest = metrics[0];
  const healthyCount = healthChecks.filter((h: any) => h.status === "healthy").length;
  const totalChecks = healthChecks.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SaaS Health & Metrics</h1>
          <p className="text-sm text-muted-foreground">Investor-ready analytics, cohort retention, and platform monitoring</p>
        </div>

        {/* KPI Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-500/10 p-2"><DollarSign className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">${(latest?.mrr || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">MRR</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-blue-500/10 p-2"><Users className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{latest?.active_workspaces || 0}</p>
                <p className="text-xs text-muted-foreground">Active Workspaces</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-purple-500/10 p-2"><TrendingUp className="h-5 w-5 text-purple-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{latest?.net_revenue_retention || 100}%</p>
                <p className="text-xs text-muted-foreground">Net Revenue Retention</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-emerald-500/10 p-2"><HeartPulse className="h-5 w-5 text-emerald-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalChecks > 0 ? Math.round((healthyCount / totalChecks) * 100) : 100}%</p>
                <p className="text-xs text-muted-foreground">Platform Health</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="metrics">
          <TabsList>
            <TabsTrigger value="metrics"><BarChart3 className="h-3.5 w-3.5 mr-1" />SaaS Metrics</TabsTrigger>
            <TabsTrigger value="cohorts"><Layers className="h-3.5 w-3.5 mr-1" />Cohort Retention</TabsTrigger>
            <TabsTrigger value="health"><Server className="h-3.5 w-3.5 mr-1" />Platform Health</TabsTrigger>
            <TabsTrigger value="growth"><TrendingUp className="h-3.5 w-3.5 mr-1" />Growth Efficiency</TabsTrigger>
          </TabsList>

          <TabsContent value="metrics">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Executive SaaS Dashboard</CardTitle>
                <CardDescription>Core SaaS metrics for founders and stakeholders</CardDescription>
              </CardHeader>
              <CardContent>
                {latest ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-xs text-muted-foreground mb-1">ARR</p>
                      <p className="text-2xl font-bold text-foreground">${(latest.arr || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Paying Users</p>
                      <p className="text-2xl font-bold text-foreground">{latest.paying_users || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Trial Users</p>
                      <p className="text-2xl font-bold text-foreground">{latest.trial_users || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Free Users</p>
                      <p className="text-2xl font-bold text-foreground">{latest.free_users || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Expansion Revenue</p>
                      <p className="text-2xl font-bold text-green-500">${(latest.expansion_revenue || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Churned Revenue</p>
                      <p className="text-2xl font-bold text-red-500">${(latest.churned_revenue || 0).toLocaleString()}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">SaaS metrics will populate as subscription data accumulates</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cohorts">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cohort Retention Analysis</CardTitle>
                <CardDescription>Retention by signup period with lifetime value signals</CardDescription>
              </CardHeader>
              <CardContent>
                {cohorts.length === 0 ? (
                  <div className="text-center py-8">
                    <Layers className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Cohort data requires multiple months of signups</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 text-muted-foreground font-medium">Cohort</th>
                          <th className="text-right p-2 text-muted-foreground font-medium">Signups</th>
                          <th className="text-right p-2 text-muted-foreground font-medium">M1</th>
                          <th className="text-right p-2 text-muted-foreground font-medium">M2</th>
                          <th className="text-right p-2 text-muted-foreground font-medium">M3</th>
                          <th className="text-right p-2 text-muted-foreground font-medium">M6</th>
                          <th className="text-right p-2 text-muted-foreground font-medium">Avg LTV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cohorts.map((c: any) => (
                          <tr key={c.id} className="border-b border-border/50">
                            <td className="p-2 font-medium text-foreground">{c.cohort_month}</td>
                            <td className="p-2 text-right text-foreground">{c.signup_count}</td>
                            <td className="p-2 text-right text-foreground">{c.signup_count > 0 ? Math.round((c.month_1_retained / c.signup_count) * 100) : 0}%</td>
                            <td className="p-2 text-right text-foreground">{c.signup_count > 0 ? Math.round((c.month_2_retained / c.signup_count) * 100) : 0}%</td>
                            <td className="p-2 text-right text-foreground">{c.signup_count > 0 ? Math.round((c.month_3_retained / c.signup_count) * 100) : 0}%</td>
                            <td className="p-2 text-right text-foreground">{c.signup_count > 0 ? Math.round((c.month_6_retained / c.signup_count) * 100) : 0}%</td>
                            <td className="p-2 text-right font-medium text-foreground">${(c.avg_ltv || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Platform Health Monitor</CardTitle>
                <CardDescription>System usage, job queues, API trends, and error rates</CardDescription>
              </CardHeader>
              <CardContent>
                {healthChecks.length === 0 ? (
                  <div className="text-center py-8">
                    <Server className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Health monitoring data will appear from system checks</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {healthChecks.slice(0, 15).map((h: any) => (
                      <div key={h.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-2.5 w-2.5 rounded-full ${h.status === "healthy" ? "bg-green-500" : h.status === "degraded" ? "bg-amber-500" : "bg-red-500"}`} />
                          <span className="text-sm font-medium text-foreground">{h.service_name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {h.response_time_ms && (
                            <span className="text-xs text-muted-foreground">{h.response_time_ms}ms</span>
                          )}
                          {h.error_count > 0 && (
                            <Badge variant="destructive" className="text-[10px]">{h.error_count} errors</Badge>
                          )}
                          <Badge variant={h.status === "healthy" ? "default" : h.status === "degraded" ? "outline" : "destructive"} className="text-xs">
                            {h.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="growth">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Growth Efficiency</CardTitle>
                  <CardDescription>Acquisition, referral contribution, and conversion funnel</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { label: "Organic Signups", value: "—", trend: "up" },
                      { label: "Referral Contribution", value: "—", trend: "up" },
                      { label: "Trial → Paid Conversion", value: "—", trend: "stable" },
                      { label: "Avg Time to Activation", value: "—", trend: "down" },
                    ].map((m, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{m.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{m.value}</span>
                          <Badge variant={m.trend === "up" ? "default" : m.trend === "down" ? "destructive" : "secondary"} className="text-[10px]">
                            {m.trend}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Strategic Summary</CardTitle>
                  <CardDescription>Periodic founder report highlights</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { title: "Growth Trend", desc: "Track MRR growth rate over time", icon: TrendingUp },
                      { title: "Risk Indicators", desc: "Churn signals and engagement drops", icon: Shield },
                      { title: "Monetization", desc: "Plan upgrades, expansion revenue", icon: DollarSign },
                      { title: "Expansion Opportunities", desc: "Upsell and cross-sell signals", icon: Activity },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                        <item.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SaaSHealth;
