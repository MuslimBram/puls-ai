import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompetitiveSignals, useCompetitiveActions, useCompetitiveStats, useMarkSignalRead, useToggleCompetitiveAction } from "@/hooks/useCompetitiveIntelligence";
import { Radar, Eye, CheckCircle, TrendingUp, AlertTriangle } from "lucide-react";

const severityColor: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-destructive/10 text-destructive",
  critical: "bg-destructive text-destructive-foreground",
};

export default function CompetitiveIntelligenceEngine() {
  const { data: signals, isLoading: loadingSignals } = useCompetitiveSignals();
  const { data: actions, isLoading: loadingActions } = useCompetitiveActions();
  const stats = useCompetitiveStats();
  const markRead = useMarkSignalRead();
  const toggleAction = useToggleCompetitiveAction();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Competitive Intelligence</h1>
          <p className="text-muted-foreground text-sm">AI-driven monitoring, gap analysis, and strategic response recommendations.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <Radar className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.totalSignals}</p>
            <p className="text-xs text-muted-foreground">Signals Detected</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <AlertTriangle className="mx-auto h-5 w-5 text-yellow-500 mb-1" />
            <p className="text-2xl font-bold">{stats.unreadSignals}</p>
            <p className="text-xs text-muted-foreground">Unread Signals</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <CheckCircle className="mx-auto h-5 w-5 text-green-500 mb-1" />
            <p className="text-2xl font-bold">{stats.completedActions}/{stats.totalActions}</p>
            <p className="text-xs text-muted-foreground">Actions Completed</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.adoptionRate}%</p>
            <p className="text-xs text-muted-foreground">Adoption Rate</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="signals">
          <TabsList>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="actions">Action Plan</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="space-y-3 mt-4">
            {loadingSignals && <p className="text-muted-foreground text-sm">Loading signals…</p>}
            {!loadingSignals && (!signals || signals.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                No competitive signals detected yet. AI will surface insights as data accumulates.
              </CardContent></Card>
            )}
            {signals?.map((s) => (
              <Card key={s.id} className={s.is_read ? "opacity-70" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{s.title}</CardTitle>
                      {s.description && <CardDescription className="text-xs">{s.description}</CardDescription>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={severityColor[s.severity] || ""}>{s.severity}</Badge>
                      {!s.is_read && (
                        <Button size="sm" variant="ghost" onClick={() => markRead.mutate({ id: s.id, fields: { is_read: true } })}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Type: {s.signal_type.replace(/_/g, " ")}</span>
                    <span>Detected: {new Date(s.detected_at).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="actions" className="space-y-3 mt-4">
            {loadingActions && <p className="text-muted-foreground text-sm">Loading actions…</p>}
            {!loadingActions && (!actions || actions.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                No strategic actions yet. Actions are generated from competitive signals.
              </CardContent></Card>
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

          <TabsContent value="trends" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Competitive Trend Tracking</CardTitle>
                <CardDescription>Campaign frequency, engagement spikes, and seasonal shifts.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  Trend visualizations will populate as more competitive data is collected.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
