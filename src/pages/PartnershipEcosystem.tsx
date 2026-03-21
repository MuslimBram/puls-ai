import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { usePartnershipOpportunities, usePartnershipActions, useEcosystemAnalytics, usePartnershipStats, useTogglePartnershipAction, useUpdateOpportunityStatus } from "@/hooks/usePartnershipEcosystem";
import { Handshake, Users, TrendingUp, CheckCircle } from "lucide-react";

export default function PartnershipEcosystem() {
  const { data: opps, isLoading: loadingOpps } = usePartnershipOpportunities();
  const { data: actions, isLoading: loadingActions } = usePartnershipActions();
  const { data: analytics } = useEcosystemAnalytics();
  const stats = usePartnershipStats();
  const toggleAction = useTogglePartnershipAction();
  const updateStatus = useUpdateOpportunityStatus();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Partnership & Ecosystem</h1>
          <p className="text-muted-foreground text-sm">AI-driven partnership detection, collaboration strategies, and network growth.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <Handshake className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.totalOpportunities}</p>
            <p className="text-xs text-muted-foreground">Opportunities</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Users className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.activeOpps}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.totalPartners}</p>
            <p className="text-xs text-muted-foreground">Partners</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <CheckCircle className="mx-auto h-5 w-5 text-green-500 mb-1" />
            <p className="text-2xl font-bold">{stats.completedActions}/{stats.totalActions}</p>
            <p className="text-xs text-muted-foreground">Actions Done</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <TrendingUp className="mx-auto h-5 w-5 text-primary mb-1" />
            <p className="text-2xl font-bold">${analytics?.[0]?.ecosystem_revenue?.toFixed(0) ?? "0"}</p>
            <p className="text-xs text-muted-foreground">Ecosystem Revenue</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="opportunities">
          <TabsList>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="actions">Action Plan</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities" className="mt-4 space-y-3">
            {loadingOpps && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingOpps && (!opps || opps.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No partnership opportunities detected yet.</CardContent></Card>
            )}
            {opps?.map((o) => (
              <Card key={o.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{o.partner_name}</CardTitle>
                      {o.match_reason && <CardDescription className="text-xs">{o.match_reason}</CardDescription>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Match: {o.match_score}%</Badge>
                      <Badge variant="secondary">{o.status}</Badge>
                      {o.status === "suggested" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: o.id, fields: { status: "in_progress" } })}>
                          Start
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">Type: {o.opportunity_type.replace(/_/g, " ")}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="actions" className="mt-4 space-y-3">
            {loadingActions && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!loadingActions && (!actions || actions.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No partnership actions yet.</CardContent></Card>
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

          <TabsContent value="analytics" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ecosystem Growth Analytics</CardTitle>
                <CardDescription>Partner count, leads, collaboration campaigns, and revenue.</CardDescription>
              </CardHeader>
              <CardContent>
                {(!analytics || analytics.length === 0) ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    Ecosystem analytics will populate as partnership data grows.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {analytics.slice(0, 10).map((s) => (
                      <div key={s.id} className="flex items-center gap-4 text-sm border-b pb-2">
                        <span className="w-24 text-muted-foreground">{s.snapshot_date}</span>
                        <span>Partners: <strong>{s.total_partners}</strong></span>
                        <span className="text-muted-foreground">Leads: {s.partner_driven_leads}</span>
                        <span className="text-muted-foreground">Campaigns: {s.collaboration_campaigns}</span>
                        <span className="text-muted-foreground">Revenue: ${s.ecosystem_revenue}</span>
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
