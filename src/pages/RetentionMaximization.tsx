import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useRetentionRisks, useRetentionActions, useRetentionAnalytics, useRetentionStats, useToggleRetentionAction } from "@/hooks/useRetentionEngine";
import { ShieldCheck, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";

const riskColor: Record<string, string> = {
  low: "secondary",
  medium: "secondary",
  high: "destructive",
  critical: "destructive",
};

export default function RetentionMaximization() {
  const { data: risks, isLoading: loadingRisks } = useRetentionRisks();
  const { data: actions, isLoading: loadingActions } = useRetentionActions();
  const { data: analytics } = useRetentionAnalytics();
  const stats = useRetentionStats();
  const toggleAction = useToggleRetentionAction();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Retention Maximization</h1>
          <p className="text-muted-foreground text-sm">Risk modeling, proactive actions, and lifetime value optimization.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <AlertTriangle className="mx-auto h-5 w-5 text-destructive mb-1" />
            <p className="text-2xl font-bold">{stats.atRiskCount}</p>
            <p className="text-xs text-muted-foreground">At Risk</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <ShieldCheck className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.latestRetentionRate}%</p>
            <p className="text-xs text-muted-foreground">Retention Rate</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-yellow-500 mb-1" />
            <p className="text-2xl font-bold">{stats.latestChurnRate}%</p>
            <p className="text-xs text-muted-foreground">Churn Rate</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <CheckCircle className="mx-auto h-5 w-5 text-green-500 mb-1" />
            <p className="text-2xl font-bold">{stats.completedActions}/{stats.totalActions}</p>
            <p className="text-xs text-muted-foreground">Actions Done</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{analytics?.[0]?.avg_lifetime_value?.toFixed(0) ?? "0"}</p>
            <p className="text-xs text-muted-foreground">Avg LTV</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="risks">
          <TabsList>
            <TabsTrigger value="risks">Risk Scores</TabsTrigger>
            <TabsTrigger value="actions">Retention Actions</TabsTrigger>
            <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          </TabsList>

          <TabsContent value="risks" className="mt-4 space-y-3">
            {loadingRisks && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingRisks && (!risks || risks.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No retention risks detected yet.</CardContent></Card>
            )}
            {risks?.map((r) => (
              <div key={r.id} className="flex items-center gap-4 p-3 border rounded-lg bg-card text-sm">
                <div className="flex-1">
                  <p className="font-medium">{r.contact_name || r.contact_identifier}</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {r.declining_engagement && <Badge variant="outline" className="text-xs">Declining engagement</Badge>}
                    {r.reduced_campaign_interaction && <Badge variant="outline" className="text-xs">Low campaign interaction</Badge>}
                    {r.slower_response && <Badge variant="outline" className="text-xs">Slower response</Badge>}
                    {r.drop_in_activity && <Badge variant="outline" className="text-xs">Activity drop</Badge>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{r.risk_score}</p>
                  <Badge variant={riskColor[r.risk_level] as any || "secondary"}>{r.risk_level}</Badge>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="actions" className="mt-4 space-y-3">
            {loadingActions && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingActions && (!actions || actions.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No retention actions yet.</CardContent></Card>
            )}
            {actions?.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
                <Checkbox checked={a.is_completed} onCheckedChange={(c) => toggleAction.mutate({ id: a.id, value: !!c })} />
                <div className="flex-1">
                  <p className={`text-sm ${a.is_completed ? "line-through text-muted-foreground" : ""}`}>{a.action_text}</p>
                  <p className="text-xs text-muted-foreground">{a.action_type.replace(/_/g, " ")}</p>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="lifecycle" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lifecycle Retention Dashboard</CardTitle>
                <CardDescription>Retention rate, churn trends, and LTV over time.</CardDescription>
              </CardHeader>
              <CardContent>
                {(!analytics || analytics.length === 0) ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    Retention analytics will populate as data accumulates.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {analytics.slice(0, 10).map((s) => (
                      <div key={s.id} className="flex items-center gap-4 text-sm border-b pb-2">
                        <span className="w-24 text-muted-foreground">{s.snapshot_date}</span>
                        <span>Retention: <strong>{s.retention_rate}%</strong></span>
                        <span className="text-muted-foreground">Churn: {s.churn_rate}%</span>
                        <span className="text-muted-foreground">LTV: ${s.avg_lifetime_value}</span>
                        <span className="text-muted-foreground">Recovered: {s.recovery_count}</span>
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
