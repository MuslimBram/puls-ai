import { DashboardLayout } from "@/components/DashboardLayout";
import { useWorkforceOptimization } from "@/hooks/useWorkforceOptimization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Users, AlertTriangle, BarChart3, Loader2, CheckCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const WorkforceOptimization = () => {
  const { utilization, alerts, analytics, generateUtilization, resolveAlert, generateAlerts } = useWorkforceOptimization();

  const severityColors: Record<string, string> = { high: "destructive", medium: "default", low: "secondary" };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Workforce Optimization</h1>
            <p className="text-sm text-muted-foreground">Balance agent capacity, workload, and efficiency</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => generateAlerts.mutate()} disabled={generateAlerts.isPending}>
              <AlertTriangle className="h-4 w-4 mr-1" /> Generate Alerts
            </Button>
            <Button onClick={() => generateUtilization.mutate()} disabled={generateUtilization.isPending}>
              {generateUtilization.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />}
              Analyze Utilization
            </Button>
          </div>
        </div>

        <Tabs defaultValue="utilization">
          <TabsList>
            <TabsTrigger value="utilization"><Users className="h-4 w-4 mr-1" />Utilization</TabsTrigger>
            <TabsTrigger value="alerts"><AlertTriangle className="h-4 w-4 mr-1" />Alerts</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="utilization" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {utilization.data?.map((a: any) => (
                <Card key={a.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{a.agent_name}</CardTitle>
                      <Badge variant={Number(a.efficiency_score) >= 80 ? "default" : Number(a.efficiency_score) >= 60 ? "secondary" : "destructive"}>
                        {a.efficiency_score}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div><span className="text-muted-foreground">Conversations</span><Progress value={Math.min(Number(a.active_conversation_minutes) / 4, 100)} className="mt-1" /></div>
                    <div><span className="text-muted-foreground">Calls</span><Progress value={Math.min(Number(a.call_handling_minutes) / 3, 100)} className="mt-1" /></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Idle Time</span><span>{a.idle_minutes} min</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Automation</span><span>{a.automation_coverage_pct}%</span></div>
                  </CardContent>
                </Card>
              ))}
              {!utilization.data?.length && <p className="text-muted-foreground col-span-full text-center py-8">No utilization data. Click "Analyze Utilization" to start.</p>}
            </div>
            {utilization.data?.length ? (
              <Card>
                <CardHeader><CardTitle className="text-base">Agent Efficiency Comparison</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={utilization.data.map((a: any) => ({ name: a.agent_name, efficiency: Number(a.efficiency_score), conversations: Number(a.active_conversation_minutes), calls: Number(a.call_handling_minutes) }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="efficiency" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="conversations" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="alerts" className="space-y-3">
            {alerts.data?.map((alert: any) => (
              <Card key={alert.id} className={alert.is_resolved ? "opacity-60" : ""}>
                <CardContent className="flex items-center gap-4 py-4">
                  <AlertTriangle className={`h-5 w-5 ${alert.severity === "high" ? "text-destructive" : "text-muted-foreground"}`} />
                  <div className="flex-1">
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.description}</p>
                  </div>
                  <Badge variant={severityColors[alert.severity] as any || "outline"}>{alert.severity}</Badge>
                  {!alert.is_resolved ? (
                    <Button size="sm" variant="outline" onClick={() => resolveAlert.mutate(alert.id)}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Resolve
                    </Button>
                  ) : <Badge variant="outline">Resolved</Badge>}
                </CardContent>
              </Card>
            ))}
            {!alerts.data?.length && <p className="text-muted-foreground text-center py-8">No capacity alerts.</p>}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Workforce Efficiency Trends</CardTitle></CardHeader>
              <CardContent>
                {analytics.data?.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="metric_date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="avg_utilization" stroke="hsl(var(--primary))" strokeWidth={2} />
                      <Line type="monotone" dataKey="efficiency_trend" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                      <Line type="monotone" dataKey="staffing_score" stroke="hsl(var(--chart-3))" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-center py-8">No analytics data yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default WorkforceOptimization;
