import { DashboardLayout } from "@/components/DashboardLayout";
import { useFunnelOptimization } from "@/hooks/useFunnelOptimization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Filter, FlaskConical, BarChart3, Lightbulb } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const FunnelOptimization = () => {
  const { stages, stagesLoading, optimizations, completeOptimization, experiments, analytics } = useFunnelOptimization();

  return (
    <DashboardLayout>
      <Tabs defaultValue="funnel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="funnel">Funnel Stages</TabsTrigger>
          <TabsTrigger value="optimizations"><Lightbulb className="h-4 w-4 mr-1" />Optimizations</TabsTrigger>
          <TabsTrigger value="experiments"><FlaskConical className="h-4 w-4 mr-1" />Experiments</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="funnel" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Funnel Stage Analysis</CardTitle></CardHeader>
            <CardContent>
              {stagesLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : stages.length === 0 ? (
                <p className="text-muted-foreground text-sm">No funnel data yet. AI will analyze your visitor-to-customer journey automatically.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={stages}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="stage_name" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="entry_count" fill="hsl(var(--primary))" name="Entries" />
                      <Bar dataKey="exit_count" fill="hsl(var(--muted-foreground))" name="Exits" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                    {stages.map((s) => (
                      <div key={s.id} className="p-3 rounded-lg border space-y-1">
                        <p className="font-medium text-sm">{s.stage_name}</p>
                        <p className="text-xs text-muted-foreground">Drop-off: {Number(s.drop_off_rate).toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">Avg time: {Number(s.avg_time_in_stage_hours).toFixed(1)}h</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimizations" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Conversion Improvement Suggestions</CardTitle></CardHeader>
            <CardContent>
              {optimizations.length === 0 ? (
                <p className="text-muted-foreground text-sm">No suggestions yet.</p>
              ) : (
                <div className="space-y-3">
                  {optimizations.map((o) => (
                    <div key={o.id} className="flex items-start justify-between p-3 rounded-lg border">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{o.title}</span>
                          <Badge variant="outline">{o.optimization_type}</Badge>
                        </div>
                        {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                      </div>
                      {!o.is_completed ? (
                        <Button size="sm" variant="outline" onClick={() => completeOptimization.mutate(o.id)}>
                          <CheckCircle className="h-3 w-3 mr-1" />Done
                        </Button>
                      ) : (
                        <Badge variant="secondary">Done</Badge>
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
            <CardHeader><CardTitle>Funnel Experiments</CardTitle></CardHeader>
            <CardContent>
              {experiments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No experiments running yet.</p>
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
                        <span>Variant A: {Number(e.conversion_a).toFixed(1)}%</span>
                        <span>Variant B: {Number(e.conversion_b).toFixed(1)}%</span>
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
            <CardHeader><CardTitle>Funnel Performance Analytics</CardTitle></CardHeader>
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
                    <Line type="monotone" dataKey="overall_conversion_rate" stroke="hsl(var(--primary))" name="Conversion Rate" />
                    <Line type="monotone" dataKey="drop_off_reduction" stroke="hsl(var(--muted-foreground))" name="Drop-off Reduction" />
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

export default FunnelOptimization;
