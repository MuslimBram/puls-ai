import { DashboardLayout } from "@/components/DashboardLayout";
import { useProcessOptimization } from "@/hooks/useProcessOptimization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, AlertTriangle, Clock, Calendar, Palette, BarChart3 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const severityColor: Record<string, string> = { low: "secondary", medium: "default", high: "destructive" };

const ProcessOptimization = () => {
  const {
    bottlenecks, bottlenecksLoading, resolveBottleneck,
    postingSchedules, styleRecommendations, adoptStyle, postingAnalytics,
  } = useProcessOptimization();

  const heatmapData = postingSchedules.reduce<Record<string, number>>((acc, s) => {
    acc[`${s.day_of_week}-${s.hour_of_day}`] = Number(s.engagement_score) || 0;
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <Tabs defaultValue="bottlenecks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bottlenecks"><AlertTriangle className="h-4 w-4 mr-1" />Bottlenecks</TabsTrigger>
          <TabsTrigger value="posting"><Calendar className="h-4 w-4 mr-1" />Posting Schedule</TabsTrigger>
          <TabsTrigger value="style"><Palette className="h-4 w-4 mr-1" />Content Style</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="bottlenecks" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Process Bottleneck Detection</CardTitle></CardHeader>
            <CardContent>
              {bottlenecksLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : bottlenecks.length === 0 ? (
                <p className="text-muted-foreground text-sm">No bottlenecks detected — operations running smoothly.</p>
              ) : (
                <div className="space-y-3">
                  {bottlenecks.map((b) => (
                    <div key={b.id} className="flex items-start justify-between p-3 rounded-lg border">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{b.title}</span>
                          <Badge variant={severityColor[b.severity] as any}>{b.severity}</Badge>
                          <Badge variant="outline">{b.bottleneck_type}</Badge>
                        </div>
                        {b.description && <p className="text-xs text-muted-foreground">{b.description}</p>}
                        {b.metric_value != null && (
                          <p className="text-xs text-muted-foreground">Metric: {Number(b.metric_value).toFixed(1)} {b.metric_unit}</p>
                        )}
                      </div>
                      {!b.is_resolved && (
                        <Button size="sm" variant="outline" onClick={() => resolveBottleneck.mutate({ id: b.id, fields: { is_resolved: true, resolved_at: new Date().toISOString() } })}>
                          <CheckCircle className="h-3 w-3 mr-1" />Resolve
                        </Button>
                      )}
                      {b.is_resolved && <Badge variant="secondary">Resolved</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posting" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>AI Posting Time Optimization — Heatmap</CardTitle></CardHeader>
            <CardContent>
              {postingSchedules.length === 0 ? (
                <p className="text-muted-foreground text-sm">No schedule data yet. AI will analyze engagement patterns to suggest optimal posting times.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left p-1">Hour</th>
                        {DAYS.map((d) => <th key={d} className="p-1 text-center">{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 24 }, (_, h) => (
                        <tr key={h}>
                          <td className="p-1 text-muted-foreground">{h}:00</td>
                          {DAYS.map((_, d) => {
                            const score = heatmapData[`${d}-${h}`] || 0;
                            const opacity = Math.min(score / 100, 1);
                            return (
                              <td key={d} className="p-1 text-center">
                                <div
                                  className="w-6 h-6 rounded mx-auto"
                                  style={{ backgroundColor: `hsl(var(--primary) / ${Math.max(opacity, 0.05)})` }}
                                  title={`Score: ${score}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="style" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>AI Content Style Recommendations</CardTitle></CardHeader>
            <CardContent>
              {styleRecommendations.length === 0 ? (
                <p className="text-muted-foreground text-sm">No style recommendations yet. AI will analyze engagement patterns.</p>
              ) : (
                <div className="space-y-3">
                  {styleRecommendations.map((r) => (
                    <div key={r.id} className="flex items-start justify-between p-3 rounded-lg border">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge>{r.tone}</Badge>
                          <Badge variant="outline">{r.content_format}</Badge>
                          {r.audience_segment && <Badge variant="secondary">{r.audience_segment}</Badge>}
                        </div>
                        {r.recommendation && <p className="text-xs text-muted-foreground">{r.recommendation}</p>}
                        <p className="text-xs text-muted-foreground">Engagement score: {Number(r.engagement_score).toFixed(1)}</p>
                      </div>
                      {!r.is_adopted ? (
                        <Button size="sm" variant="outline" onClick={() => adoptStyle.mutate({ id: r.id, fields: { is_adopted: true, adopted_at: new Date().toISOString() } })}>Adopt</Button>
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

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Posting Performance Analytics</CardTitle></CardHeader>
            <CardContent>
              {postingAnalytics.length === 0 ? (
                <p className="text-muted-foreground text-sm">No analytics data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[...postingAnalytics].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metric_date" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="engagement_lift" stroke="hsl(var(--primary))" name="Engagement Lift" />
                    <Line type="monotone" dataKey="consistency_score" stroke="hsl(var(--muted-foreground))" name="Consistency" />
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

export default ProcessOptimization;
