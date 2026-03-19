import { DashboardLayout } from "@/components/DashboardLayout";
import { usePersonalizationEngine } from "@/hooks/usePersonalizationEngine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Users, Sparkles, Settings, BarChart3, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const PersonalizationEngine = () => {
  const { profiles, rules, analytics, generateProfiles, createRule, toggleRule } = usePersonalizationEngine();

  const segmentColors: Record<string, string> = { high_value: "default", trial: "secondary", at_risk: "destructive" };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Personalization Engine</h1>
            <p className="text-sm text-muted-foreground">Deliver tailored experiences across every touchpoint</p>
          </div>
          <Button onClick={() => generateProfiles.mutate()} disabled={generateProfiles.isPending}>
            {generateProfiles.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate Profiles
          </Button>
        </div>

        <Tabs defaultValue="profiles">
          <TabsList>
            <TabsTrigger value="profiles"><Users className="h-4 w-4 mr-1" />Profiles</TabsTrigger>
            <TabsTrigger value="rules"><Settings className="h-4 w-4 mr-1" />Rules</TabsTrigger>
            <TabsTrigger value="insights"><Sparkles className="h-4 w-4 mr-1" />Insights</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {profiles.data?.map((p: any) => (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{p.contact_name}</CardTitle>
                      <Badge variant={segmentColors[p.segment] as any || "outline"}>{p.segment}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Engagement Score</span><span className="font-semibold">{p.engagement_score}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Preferred Channel</span><span>{p.preferred_channel}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Best Timing</span><span>{p.preferred_timing}</span></div>
                    {(p.purchase_signals as any[])?.length > 0 && (
                      <div className="pt-1">
                        <span className="text-muted-foreground text-xs">Signals:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(p.purchase_signals as any[]).map((s: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">{s.signal} ({Math.round(s.strength * 100)}%)</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {!profiles.data?.length && <p className="text-muted-foreground col-span-full text-center py-8">No profiles yet. Click "Generate Profiles" to start.</p>}
            </div>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => createRule.mutate({ rule_name: "Auto-personalize premium segment", rule_type: "messaging", conditions: { segment: "high_value", engagement_above: 80 }, actions: { tone: "premium", offer: "exclusive_discount" } })}>
                <Settings className="h-4 w-4 mr-1" /> Add Sample Rule
              </Button>
            </div>
            <div className="space-y-3">
              {rules.data?.map((r: any) => (
                <Card key={r.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{r.rule_name}</p>
                      <p className="text-xs text-muted-foreground">Type: {r.rule_type} · Priority: {r.priority}</p>
                    </div>
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggleRule.mutate({ id: r.id, is_active: v })} />
                  </CardContent>
                </Card>
              ))}
              {!rules.data?.length && <p className="text-muted-foreground text-center py-8">No rules configured yet.</p>}
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-primary">{profiles.data?.length || 0}</p><p className="text-sm text-muted-foreground">Active Profiles</p></CardContent></Card>
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-primary">{rules.data?.filter((r: any) => r.is_active).length || 0}</p><p className="text-sm text-muted-foreground">Active Rules</p></CardContent></Card>
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-primary">{profiles.data?.filter((p: any) => p.preferred_channel === "email").length || 0}</p><p className="text-sm text-muted-foreground">Email-Preferred</p></CardContent></Card>
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">Channel Preferences Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={["email", "chat", "phone", "sms"].map((ch) => ({ channel: ch, count: profiles.data?.filter((p: any) => p.preferred_channel === ch).length || 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="channel" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Engagement Lift Over Time</CardTitle></CardHeader>
              <CardContent>
                {analytics.data?.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="metric_date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="engagement_lift" stroke="hsl(var(--primary))" strokeWidth={2} />
                      <Line type="monotone" dataKey="conversion_change" stroke="hsl(var(--chart-2))" strokeWidth={2} />
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

export default PersonalizationEngine;
