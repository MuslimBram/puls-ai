import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePricingOptimizations, useAdoptPricingSuggestion, usePricingSnapshots, usePricingAnalytics } from "@/hooks/usePricingOptimization";
import { DollarSign, TrendingUp, Percent, CheckCircle2, Tag, BarChart3 } from "lucide-react";

const PricingOptimization = () => {
  const { data: suggestions } = usePricingOptimizations();
  const { data: snapshots } = usePricingSnapshots();
  const { data: analytics } = usePricingAnalytics();
  const adoptSuggestion = useAdoptPricingSuggestion();

  const pending = (suggestions || []).filter((s) => s.status === "pending");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pricing Optimization Engine</h1>
          <p className="text-sm text-muted-foreground">AI-driven pricing strategies to improve conversion and profitability</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Tag className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{analytics?.total ?? 0}</p><p className="text-xs text-muted-foreground">Suggestions</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{analytics?.adopted ?? 0}</p><p className="text-xs text-muted-foreground">Adopted</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="h-8 w-8 text-accent" /><div><p className="text-2xl font-bold">{analytics?.adoptionRate ?? 0}%</p><p className="text-xs text-muted-foreground">Adoption Rate</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Percent className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold">{analytics?.pending ?? 0}</p><p className="text-xs text-muted-foreground">Pending</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="suggestions">
          <TabsList>
            <TabsTrigger value="suggestions">Suggestions ({pending.length})</TabsTrigger>
            <TabsTrigger value="trends">Pricing Trends</TabsTrigger>
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          </TabsList>

          <TabsContent value="suggestions" className="space-y-3">
            {pending.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No pending pricing suggestions</CardContent></Card>
            ) : pending.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">{s.suggestion_type}</Badge>
                      <span className="text-xs text-muted-foreground">{Math.round(s.confidence * 100)}% confidence</span>
                    </div>
                    <p className="font-medium text-sm">{s.title}</p>
                    {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                    {s.predicted_impact?.conversion_lift && (
                      <p className="text-xs text-green-600 mt-1">Predicted conversion lift: +{s.predicted_impact.conversion_lift}%</p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => adoptSuggestion.mutate({ id: s.id, fields: { status: "adopted", adopted_at: new Date().toISOString() } })} className="ml-4">
                    <CheckCircle2 className="mr-1 h-3 w-3" />Adopt
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="trends" className="space-y-3">
            {(snapshots || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No pricing trend data yet</CardContent></Card>
            ) : (snapshots || []).map((snap) => (
              <Card key={snap.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{snap.snapshot_date}</p>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Conv: {snap.conversion_rate}%</span>
                      <span>ARPU: ${snap.avg_revenue_per_user}</span>
                      <span>Churn: {snap.churn_rate}%</span>
                      <span>Upgrade: {snap.upgrade_rate}%</span>
                    </div>
                  </div>
                  <Badge variant={snap.trial_conversion_rate > 20 ? "default" : "secondary"} className="text-[10px]">
                    Trial Conv: {snap.trial_conversion_rate}%
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="breakdown">
            <Card>
              <CardHeader><CardTitle className="text-base">Suggestion Types</CardTitle></CardHeader>
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

export default PricingOptimization;
