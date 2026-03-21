import { DashboardLayout } from "@/components/DashboardLayout";
import { useCustomerValueMaximization } from "@/hooks/useCustomerValueMaximization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, TrendingUp, Share2, Zap, BarChart3 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const trendColors: Record<string, string> = { growing: "default", stable: "secondary", declining: "destructive" };

const CustomerValueMaximization = () => {
  const {
    valueSignals, valueSignalsLoading, upsellActions, completeUpsellAction,
    viralTriggers, viralAnalytics,
  } = useCustomerValueMaximization();

  return (
    <DashboardLayout>
      <Tabs defaultValue="value" className="space-y-4">
        <TabsList>
          <TabsTrigger value="value"><TrendingUp className="h-4 w-4 mr-1" />Value Signals</TabsTrigger>
          <TabsTrigger value="upsell"><Zap className="h-4 w-4 mr-1" />Upsell Journey</TabsTrigger>
          <TabsTrigger value="viral"><Share2 className="h-4 w-4 mr-1" />Viral Triggers</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="value" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Customer Value Growth Signals</CardTitle></CardHeader>
            <CardContent>
              {valueSignalsLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : valueSignals.length === 0 ? (
                <p className="text-muted-foreground text-sm">No value signals detected yet. AI will analyze interaction patterns.</p>
              ) : (
                <div className="space-y-3">
                  {valueSignals.map((v) => (
                    <div key={v.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{v.contact_name || v.contact_identifier}</span>
                        <Badge variant={trendColors[v.value_trend || "stable"] as any}>{v.value_trend}</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>LTV: ${Number(v.lifetime_value_estimate).toFixed(0)}</span>
                        <span>Interactions: {v.repeat_interaction_count}</span>
                        <span>Upsell score: {Number(v.upsell_responsiveness).toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upsell" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Smart Upsell Journey Optimization</CardTitle></CardHeader>
            <CardContent>
              {upsellActions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No upsell actions yet.</p>
              ) : (
                <div className="space-y-3">
                  {upsellActions.map((a) => (
                    <div key={a.id} className="flex items-start justify-between p-3 rounded-lg border">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{a.title}</span>
                          <Badge variant="outline">{a.action_type}</Badge>
                          {a.target_segment && <Badge variant="secondary">{a.target_segment}</Badge>}
                        </div>
                        {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                      </div>
                      {!a.is_completed ? (
                        <Button size="sm" variant="outline" onClick={() => completeUpsellAction.mutate({ id: a.id, value: true })}>
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

        <TabsContent value="viral" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Viral Re-Engagement Triggers</CardTitle></CardHeader>
            <CardContent>
              {viralTriggers.length === 0 ? (
                <p className="text-muted-foreground text-sm">No viral triggers configured yet.</p>
              ) : (
                <div className="space-y-3">
                  {viralTriggers.map((t) => (
                    <div key={t.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{t.prompt_text}</span>
                        <Badge>{t.trigger_type}</Badge>
                        {t.is_active ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>Fired: {t.fire_count}</span>
                        <span>Conversions: {t.conversion_count}</span>
                        <span>Incentive: {t.incentive_type} {t.incentive_value || ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Viral Engagement Analytics</CardTitle></CardHeader>
            <CardContent>
              {viralAnalytics.length === 0 ? (
                <p className="text-muted-foreground text-sm">No analytics data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[...viralAnalytics].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metric_date" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="sharing_rate" stroke="hsl(var(--primary))" name="Sharing Rate" />
                    <Line type="monotone" dataKey="reengagement_lift" stroke="hsl(var(--muted-foreground))" name="Re-engagement Lift" />
                    <Line type="monotone" dataKey="new_referrals" stroke="hsl(var(--accent-foreground))" name="New Referrals" />
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

export default CustomerValueMaximization;
