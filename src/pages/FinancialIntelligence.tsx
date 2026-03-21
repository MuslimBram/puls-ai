import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRevenueAttribution, useProfitInsights, useRevenueForecasts } from "@/hooks/useFinancialIntelligence";
import { DollarSign, TrendingUp, Lightbulb, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Target } from "lucide-react";

const FinancialIntelligence = () => {
  const { data: attributions = [] } = useRevenueAttribution();
  const { data: insights = [] } = useProfitInsights();
  const { data: forecasts = [] } = useRevenueForecasts();

  const totalRevenue = (attributions as any[]).reduce((s: number, a: any) => s + (a.revenue_amount || 0), 0);
  const bySource = (attributions as any[]).reduce((acc: Record<string, number>, a: any) => {
    const k = a.source_type || "other";
    acc[k] = (acc[k] || 0) + (a.revenue_amount || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Intelligence</h1>
          <p className="text-sm text-muted-foreground">Revenue attribution, profit optimization, and forecasting</p>
        </div>

        {/* KPI Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-500/10 p-2"><DollarSign className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">${totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Attributed Revenue</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-amber-500/10 p-2"><Lightbulb className="h-5 w-5 text-amber-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{insights.length}</p>
                <p className="text-xs text-muted-foreground">Active Profit Insights</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-blue-500/10 p-2"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{Object.keys(bySource).length}</p>
                <p className="text-xs text-muted-foreground">Revenue Sources</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-purple-500/10 p-2"><BarChart3 className="h-5 w-5 text-purple-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{forecasts.length}</p>
                <p className="text-xs text-muted-foreground">Forecast Points</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="attribution">
          <TabsList>
            <TabsTrigger value="attribution"><PieChart className="h-3.5 w-3.5 mr-1" />Attribution</TabsTrigger>
            <TabsTrigger value="insights"><Lightbulb className="h-3.5 w-3.5 mr-1" />Profit Insights</TabsTrigger>
            <TabsTrigger value="forecasts"><TrendingUp className="h-3.5 w-3.5 mr-1" />Forecasting</TabsTrigger>
          </TabsList>

          <TabsContent value="attribution">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Revenue Attribution Breakdown</CardTitle>
                <CardDescription>Revenue attributed to campaigns, channels, agents, and AI automations</CardDescription>
              </CardHeader>
              <CardContent>
                {attributions.length === 0 ? (
                  <div className="text-center py-8">
                    <PieChart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Revenue attribution data will appear as deals close</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(bySource).sort((a, b) => Number(b[1]) - Number(a[1])).map(([source, amount]) => (
                      <div key={source} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">{source}</Badge>
                          <span className="text-sm text-foreground capitalize">{source} Revenue</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">${Number(amount).toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground">
                            ({totalRevenue > 0 ? Math.round((Number(amount) / totalRevenue) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">AI Profit Suggestions</CardTitle>
                <CardDescription>Recommendations to optimize revenue and reduce costs</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.length === 0 ? (
                  <div className="text-center py-8">
                    <Lightbulb className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">AI will generate profit optimization suggestions based on your activity</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {insights.map((insight: any) => (
                      <div key={insight.id} className="rounded-lg border border-border p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={insight.category === "scale" ? "default" : insight.category === "reduce" ? "destructive" : "secondary"} className="text-xs">
                                {insight.category}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Impact: {Math.round(insight.impact_score)}/100</span>
                            </div>
                            <p className="text-sm font-medium text-foreground">{insight.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                          </div>
                          {insight.impact_score > 70 ? (
                            <ArrowUpRight className="h-5 w-5 text-green-500 shrink-0" />
                          ) : (
                            <ArrowDownRight className="h-5 w-5 text-amber-500 shrink-0" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forecasts">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Revenue Forecasting</CardTitle>
                <CardDescription>Predicted lead flow, conversions, and revenue trajectory</CardDescription>
              </CardHeader>
              <CardContent>
                {forecasts.length === 0 ? (
                  <div className="text-center py-8">
                    <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Forecasting requires sufficient historical data</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {forecasts.map((f: any) => (
                      <div key={f.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-foreground">{f.forecast_date}</span>
                          <Badge variant="outline" className="text-xs">{Math.round((f.confidence || 0) * 100)}% confidence</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">{f.predicted_leads} leads</span>
                          <span className="text-muted-foreground">{f.predicted_conversions} conv.</span>
                          <span className="font-bold text-foreground">${(f.predicted_revenue || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default FinancialIntelligence;
