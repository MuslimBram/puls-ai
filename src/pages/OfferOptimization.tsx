import { DashboardLayout } from "@/components/DashboardLayout";
import { useOfferOptimization } from "@/hooks/useOfferOptimization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Gift, FlaskConical, BarChart3, Lightbulb } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const OfferOptimization = () => {
  const { analysis, analysisLoading, suggestions, adoptSuggestion, experiments, analytics } = useOfferOptimization();

  return (
    <DashboardLayout>
      <Tabs defaultValue="analysis" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analysis"><Gift className="h-4 w-4 mr-1" />Offer Analysis</TabsTrigger>
          <TabsTrigger value="suggestions"><Lightbulb className="h-4 w-4 mr-1" />Suggestions</TabsTrigger>
          <TabsTrigger value="experiments"><FlaskConical className="h-4 w-4 mr-1" />Experiments</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Offer Performance Analysis</CardTitle></CardHeader>
            <CardContent>
              {analysisLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : analysis.length === 0 ? (
                <p className="text-muted-foreground text-sm">No offer data yet. AI will analyze your campaign offers automatically.</p>
              ) : (
                <div className="space-y-3">
                  {analysis.map((a) => (
                    <div key={a.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{a.offer_name}</span>
                        <Badge>{a.offer_type}</Badge>
                        {a.channel && <Badge variant="outline">{a.channel}</Badge>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>Conversion: {Number(a.conversion_rate).toFixed(1)}%</span>
                        <span>Engagement: {Number(a.engagement_score).toFixed(1)}</span>
                        <span>Revenue: ${Number(a.revenue_impact).toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Offer Structuring Suggestions</CardTitle></CardHeader>
            <CardContent>
              {suggestions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No suggestions yet.</p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((s) => (
                    <div key={s.id} className="flex items-start justify-between p-3 rounded-lg border">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{s.title}</span>
                          <Badge variant="outline">{s.suggestion_type}</Badge>
                          {s.target_segment && <Badge variant="secondary">{s.target_segment}</Badge>}
                        </div>
                        {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                      </div>
                      {!s.is_adopted ? (
                        <Button size="sm" variant="outline" onClick={() => adoptSuggestion.mutate(s.id)}>
                          <CheckCircle className="h-3 w-3 mr-1" />Adopt
                        </Button>
                      ) : (
                        <Badge variant="secondary">Adopted</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="experiments" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Offer A/B Experiments</CardTitle></CardHeader>
            <CardContent>
              {experiments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No experiments yet.</p>
              ) : (
                <div className="space-y-3">
                  {experiments.map((e) => (
                    <div key={e.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{e.name}</span>
                        <Badge>{e.status}</Badge>
                        <Badge variant="outline">{e.experiment_type}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>A: {Number(e.conversion_a).toFixed(1)}% / ${Number(e.revenue_a).toFixed(0)}</span>
                        <span>B: {Number(e.conversion_b).toFixed(1)}% / ${Number(e.revenue_b).toFixed(0)}</span>
                      </div>
                      {e.winner && <Badge variant="secondary">Winner: {e.winner}</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Offer Performance Analytics</CardTitle></CardHeader>
            <CardContent>
              {analytics.length === 0 ? (
                <p className="text-muted-foreground text-sm">No analytics data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[...analytics].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metric_date" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="conversion_lift" stroke="hsl(var(--primary))" name="Conversion Lift" />
                    <Line type="monotone" dataKey="revenue_impact" stroke="hsl(var(--muted-foreground))" name="Revenue Impact" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default OfferOptimization;
