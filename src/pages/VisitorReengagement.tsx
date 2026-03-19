import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGrowthExperiments, useVisitorInactivity, useReengagementAnalytics, useReengagementStats, useMarkReengaged, useUpdateExperimentStatus } from "@/hooks/useReengagement";
import { FlaskConical, UserX, RefreshCw, TrendingUp } from "lucide-react";

const statusColor: Record<string, string> = {
  draft: "secondary",
  running: "default",
  completed: "outline",
  failed: "destructive",
};

export default function VisitorReengagement() {
  const { data: experiments, isLoading: loadingExp } = useGrowthExperiments();
  const { data: inactive, isLoading: loadingInactive } = useVisitorInactivity();
  const { data: analytics } = useReengagementAnalytics();
  const stats = useReengagementStats();
  const markReengaged = useMarkReengaged();
  const updateExpStatus = useUpdateExperimentStatus();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Innovation & Re-Engagement</h1>
          <p className="text-muted-foreground text-sm">Growth experiments, visitor inactivity detection, and re-engagement automation.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <FlaskConical className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.activeExperiments}</p>
            <p className="text-xs text-muted-foreground">Active Experiments</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <UserX className="mx-auto h-5 w-5 text-destructive mb-1" />
            <p className="text-2xl font-bold">{stats.inactiveCount}</p>
            <p className="text-xs text-muted-foreground">Inactive Visitors</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <RefreshCw className="mx-auto h-5 w-5 text-green-500 mb-1" />
            <p className="text-2xl font-bold">{stats.reactivationRate}%</p>
            <p className="text-xs text-muted-foreground">Reactivation Rate</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.churnPrevented}</p>
            <p className="text-xs text-muted-foreground">Churn Prevented</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="experiments">
          <TabsList>
            <TabsTrigger value="experiments">Experiments</TabsTrigger>
            <TabsTrigger value="inactive">Inactive Visitors</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="experiments" className="mt-4 space-y-3">
            {loadingExp && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingExp && (!experiments || experiments.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No growth experiments yet. AI will suggest experiments based on patterns.</CardContent></Card>
            )}
            {experiments?.map((e) => (
              <Card key={e.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{e.title}</CardTitle>
                      {e.hypothesis && <CardDescription className="text-xs">{e.hypothesis}</CardDescription>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusColor[e.status] as any || "secondary"}>{e.status}</Badge>
                      {e.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => updateExpStatus.mutate({ id: e.id, status: "running" })}>
                          Start
                        </Button>
                      )}
                      {e.status === "running" && (
                        <Button size="sm" variant="outline" onClick={() => updateExpStatus.mutate({ id: e.id, status: "completed" })}>
                          Complete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Type: {e.experiment_type.replace(/_/g, " ")}</span>
                    {e.variant_a && <span>A: {e.variant_a}</span>}
                    {e.variant_b && <span>B: {e.variant_b}</span>}
                    {e.lift_pct !== null && <span className="text-green-600 font-medium">Lift: {e.lift_pct}%</span>}
                  </div>
                  {e.result_summary && <p className="text-xs mt-1 text-muted-foreground">{e.result_summary}</p>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="inactive" className="mt-4 space-y-3">
            {loadingInactive && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingInactive && (!inactive || inactive.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No inactive visitors detected.</CardContent></Card>
            )}
            {inactive?.map((v) => (
              <div key={v.id} className="flex items-center gap-4 p-3 border rounded-lg bg-card text-sm">
                <div className="flex-1">
                  <p className="font-medium">{v.contact_name || v.contact_identifier}</p>
                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{v.days_inactive} days inactive</span>
                    <span>•</span>
                    <span>Type: {v.inactivity_type.replace(/_/g, " ")}</span>
                    <span>•</span>
                    <span>Best channel: {v.recommended_channel}</span>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <Badge variant={v.inactivity_score > 70 ? "destructive" : "secondary"}>Score: {v.inactivity_score}</Badge>
                  <Button size="sm" variant="outline" onClick={() => markReengaged.mutate(v.id)}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Re-engage
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Re-Engagement Analytics</CardTitle>
                <CardDescription>Reactivation rate, recovery signals, and campaign performance.</CardDescription>
              </CardHeader>
              <CardContent>
                {(!analytics || analytics.length === 0) ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    Analytics will populate as re-engagement campaigns run.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {analytics.slice(0, 10).map((s) => (
                      <div key={s.id} className="flex items-center gap-4 text-sm border-b pb-2">
                        <span className="w-24 text-muted-foreground">{s.snapshot_date}</span>
                        <span>Reactivation: <strong>{s.reactivation_rate}%</strong></span>
                        <span className="text-muted-foreground">Recovery: {s.engagement_recovery_pct}%</span>
                        <span className="text-muted-foreground">Campaigns: {s.campaigns_sent}</span>
                        <span className="text-muted-foreground">Churn Prevented: {s.churn_prevented}</span>
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
}
