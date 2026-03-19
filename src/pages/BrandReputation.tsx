import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useBrandSentiment, useBrandRiskAlerts, useBrandActions, useBrandStats, useResolveBrandAlert, useToggleBrandAction } from "@/hooks/useBrandReputation";
import { Heart, ShieldAlert, CheckCircle, TrendingUp } from "lucide-react";

export default function BrandReputation() {
  const { data: sentiment, isLoading: loadingSentiment } = useBrandSentiment();
  const { data: alerts, isLoading: loadingAlerts } = useBrandRiskAlerts();
  const { data: actions, isLoading: loadingActions } = useBrandActions();
  const stats = useBrandStats();
  const resolveAlert = useResolveBrandAlert();
  const toggleAction = useToggleBrandAction();

  const scoreColor = stats.latestScore >= 70 ? "text-green-600" : stats.latestScore >= 40 ? "text-yellow-600" : "text-destructive";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Brand & Reputation</h1>
          <p className="text-muted-foreground text-sm">AI-powered sentiment monitoring, risk alerts, and brand improvement actions.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <Heart className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className={`text-2xl font-bold ${scoreColor}`}>{stats.latestScore}</p>
            <p className="text-xs text-muted-foreground">Brand Score</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <ShieldAlert className="mx-auto h-5 w-5 text-yellow-500 mb-1" />
            <p className="text-2xl font-bold">{stats.activeAlerts}</p>
            <p className="text-xs text-muted-foreground">Active Risk Alerts</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <CheckCircle className="mx-auto h-5 w-5 text-green-500 mb-1" />
            <p className="text-2xl font-bold">{stats.completedActions}/{stats.totalActions}</p>
            <p className="text-xs text-muted-foreground">Actions Done</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{sentiment?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Data Points</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="sentiment">
          <TabsList>
            <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
            <TabsTrigger value="alerts">Risk Alerts</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="sentiment" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sentiment Trends</CardTitle>
                <CardDescription>Positive vs neutral vs negative perception over time.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSentiment && <p className="text-muted-foreground text-sm">Loading…</p>}
                {!loadingSentiment && (!sentiment || sentiment.length === 0) ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    Sentiment data will populate as conversations and campaigns are analyzed.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sentiment?.slice(0, 10).map((s) => (
                      <div key={s.id} className="flex items-center gap-4 text-sm border-b pb-2">
                        <span className="w-24 text-muted-foreground">{s.score_date}</span>
                        <Badge variant="outline" className="text-green-600">+{s.positive_pct}%</Badge>
                        <Badge variant="outline" className="text-muted-foreground">{s.neutral_pct}%</Badge>
                        <Badge variant="outline" className="text-destructive">-{s.negative_pct}%</Badge>
                        <span className="ml-auto font-medium">Score: {s.overall_score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-3 mt-4">
            {loadingAlerts && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingAlerts && (!alerts || alerts.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No risk alerts detected.</CardContent></Card>
            )}
            {alerts?.map((a) => (
              <Card key={a.id} className={a.is_resolved ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{a.title}</CardTitle>
                      {a.description && <CardDescription className="text-xs">{a.description}</CardDescription>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.severity === "high" || a.severity === "critical" ? "destructive" : "secondary"}>{a.severity}</Badge>
                      {!a.is_resolved && (
                        <Button size="sm" variant="outline" onClick={() => resolveAlert.mutate(a.id)}>Resolve</Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="actions" className="space-y-3 mt-4">
            {loadingActions && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingActions && (!actions || actions.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No brand improvement actions yet.</CardContent></Card>
            )}
            {actions?.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
                <Checkbox
                  checked={a.is_completed}
                  onCheckedChange={(checked) => toggleAction.mutate({ id: a.id, completed: !!checked })}
                />
                <div className="flex-1">
                  <p className={`text-sm ${a.is_completed ? "line-through text-muted-foreground" : ""}`}>{a.action_text}</p>
                  <p className="text-xs text-muted-foreground">{a.action_type.replace(/_/g, " ")}</p>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
