import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCxJourneyEvents, useCxRiskAlerts, useCxScores, useCxStats, useResolveCxAlert } from "@/hooks/useCustomerExperience";
import { Smile, AlertTriangle, Activity, TrendingUp } from "lucide-react";

const stageLabels: Record<string, string> = {
  first_contact: "First Contact",
  response: "Response",
  campaign_interaction: "Campaign",
  call_outcome: "Call",
  deal_closure: "Deal Close",
  support: "Support",
};

export default function CustomerExperience() {
  const { data: events, isLoading: loadingEvents } = useCxJourneyEvents();
  const { data: alerts, isLoading: loadingAlerts } = useCxRiskAlerts();
  const { data: scores, isLoading: loadingScores } = useCxScores();
  const stats = useCxStats();
  const resolveAlert = useResolveCxAlert();

  const cxColor = stats.latestCxScore >= 70 ? "text-green-600" : stats.latestCxScore >= 40 ? "text-yellow-600" : "text-destructive";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customer Experience</h1>
          <p className="text-muted-foreground text-sm">Journey mapping, risk detection, and CX optimization insights.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <Smile className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className={`text-2xl font-bold ${cxColor}`}>{stats.latestCxScore}</p>
            <p className="text-xs text-muted-foreground">CX Score</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <AlertTriangle className="mx-auto h-5 w-5 text-yellow-500 mb-1" />
            <p className="text-2xl font-bold">{stats.activeAlerts}</p>
            <p className="text-xs text-muted-foreground">CX Risk Alerts</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Activity className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.totalEvents}</p>
            <p className="text-xs text-muted-foreground">Journey Events</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-destructive mb-1" />
            <p className="text-2xl font-bold">{stats.frictionPoints}</p>
            <p className="text-xs text-muted-foreground">Friction Points</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="journey">
          <TabsList>
            <TabsTrigger value="journey">Journey Map</TabsTrigger>
            <TabsTrigger value="alerts">Risk Alerts</TabsTrigger>
            <TabsTrigger value="scores">CX Scores</TabsTrigger>
          </TabsList>

          <TabsContent value="journey" className="mt-4 space-y-3">
            {loadingEvents && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingEvents && (!events || events.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                Journey events will populate as customer interactions are tracked.
              </CardContent></Card>
            )}
            {events?.slice(0, 20).map((e) => (
              <div key={e.id} className="flex items-center gap-4 p-3 border rounded-lg bg-card text-sm">
                <Badge variant="outline">{stageLabels[e.stage] || e.stage}</Badge>
                <div className="flex-1">
                  <p>{e.event_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{e.contact_identifier}</p>
                </div>
                <Badge variant={e.sentiment === "positive" ? "default" : e.sentiment === "negative" ? "destructive" : "secondary"}>
                  {e.sentiment}
                </Badge>
                {e.friction_score > 60 && <Badge variant="destructive">Friction: {e.friction_score}</Badge>}
                <span className="text-xs text-muted-foreground">{new Date(e.occurred_at).toLocaleDateString()}</span>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="alerts" className="mt-4 space-y-3">
            {loadingAlerts && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingAlerts && (!alerts || alerts.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No CX risk alerts detected.</CardContent></Card>
            )}
            {alerts?.map((a) => (
              <Card key={a.id} className={a.is_resolved ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{a.title}</CardTitle>
                      {a.description && <CardDescription className="text-xs">{a.description}</CardDescription>}
                      {a.contact_identifier && <p className="text-xs text-muted-foreground mt-1">Contact: {a.contact_identifier}</p>}
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

          <TabsContent value="scores" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">CX Score History</CardTitle>
                <CardDescription>Response speed, resolution quality, and engagement scores over time.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingScores && <p className="text-muted-foreground text-sm">Loading…</p>}
                {!loadingScores && (!scores || scores.length === 0) ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    CX scores will populate as customer interaction data grows.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scores?.map((s) => (
                      <div key={s.id} className="flex items-center gap-4 text-sm border-b pb-2">
                        <span className="w-24 text-muted-foreground">{s.score_date}</span>
                        <span>CX: <strong>{s.cx_score}</strong></span>
                        <span className="text-muted-foreground">Speed: {s.response_speed_score}</span>
                        <span className="text-muted-foreground">Resolution: {s.resolution_score}</span>
                        <span className="text-muted-foreground">Engagement: {s.engagement_score}</span>
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
