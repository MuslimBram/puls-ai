import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRevenueOpportunities, useActOnOpportunity, useRevenueTrends, useRevenueAnalytics } from "@/hooks/useRevenueEngine";
import { DollarSign, TrendingUp, TrendingDown, Target, Zap, ArrowUpRight, BarChart3 } from "lucide-react";

const urgencyColor: Record<string, string> = { high: "destructive", medium: "default", low: "secondary" } as any;

const RevenueEngine = () => {
  const { data: opportunities } = useRevenueOpportunities();
  const { data: trends } = useRevenueTrends();
  const { data: analytics } = useRevenueAnalytics();
  const actOnOpp = useActOnOpportunity();

  const pending = (opportunities || []).filter((o) => o.status === "detected");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Revenue Engine</h1>
          <p className="text-sm text-muted-foreground">AI-driven revenue opportunities and autonomous growth actions</p>
        </div>

        {/* Analytics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Target className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{analytics?.totalOpportunities ?? 0}</p><p className="text-xs text-muted-foreground">Opportunities</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">${(analytics?.totalPipelineValue ?? 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Pipeline Value</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><ArrowUpRight className="h-8 w-8 text-accent" /><div><p className="text-2xl font-bold">{analytics?.conversionRate ?? 0}%</p><p className="text-xs text-muted-foreground">Action Rate</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Zap className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold">{analytics?.pendingOpportunities ?? 0}</p><p className="text-xs text-muted-foreground">Pending</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="opportunities">
          <TabsList>
            <TabsTrigger value="opportunities">Opportunities ({pending.length})</TabsTrigger>
            <TabsTrigger value="trends">Revenue Trends</TabsTrigger>
            <TabsTrigger value="analytics">Breakdown</TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities" className="space-y-3">
            {pending.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No pending revenue opportunities</CardContent></Card>
            ) : pending.map((opp) => (
              <Card key={opp.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">{opp.opportunity_type}</Badge>
                      <Badge variant={urgencyColor[opp.urgency] as any || "outline"} className="text-[10px]">{opp.urgency}</Badge>
                      <span className="text-xs text-muted-foreground">{Math.round(opp.confidence * 100)}%</span>
                    </div>
                    <p className="font-medium text-sm">{opp.title}</p>
                    {opp.description && <p className="text-xs text-muted-foreground mt-1">{opp.description}</p>}
                    {opp.suggested_action && <p className="text-xs text-primary mt-1">→ {opp.suggested_action}</p>}
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-sm font-bold text-green-600">${opp.estimated_value.toLocaleString()}</span>
                    <Button size="sm" onClick={() => actOnOpp.mutate({ id: opp.id, fields: { status: "acted", outcome: "followed_up", action_taken_at: new Date().toISOString(), updated_at: new Date().toISOString() } })}><Zap className="mr-1 h-3 w-3" />Act</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="trends" className="space-y-3">
            {(trends || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No revenue trend data yet</CardContent></Card>
            ) : (trends || []).map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {t.trend_signal === "growing" ? <TrendingUp className="h-4 w-4 text-green-500" /> : t.trend_signal === "declining" ? <TrendingDown className="h-4 w-4 text-destructive" /> : <BarChart3 className="h-4 w-4 text-muted-foreground" />}
                    <div>
                      <p className="text-sm font-medium">{t.snapshot_date}</p>
                      <p className="text-xs text-muted-foreground">AI: ${t.ai_attributed_revenue} | Upsell: ${t.upsell_revenue} | New: ${t.new_deal_revenue}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">${t.total_revenue.toLocaleString()}</p>
                    <Badge variant={t.trend_signal === "growing" ? "default" : t.trend_signal === "declining" ? "destructive" : "secondary"} className="text-[10px]">{t.trend_signal}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader><CardTitle className="text-base">Opportunity Types</CardTitle></CardHeader>
              <CardContent>
                {analytics?.byType && Object.keys(analytics.byType).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(analytics.byType).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{type.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(20, (count as number) * 30)}px` }} />
                          <span className="text-sm font-medium">{count as number}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default RevenueEngine;
