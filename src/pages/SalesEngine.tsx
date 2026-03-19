import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHotOpportunities, useSalesOutreach, useSalesPerformance } from "@/hooks/useSalesEngine";
import { useDeals, usePipelineStats } from "@/hooks/useCRM";
import { Flame, Send, TrendingUp, BarChart3, Target, DollarSign, Zap, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const SalesEngine = () => {
  const { data: opportunities = [] } = useHotOpportunities();
  const { outreach, isLoading: outreachLoading } = useSalesOutreach();
  const { data: perfSnapshots = [] } = useSalesPerformance();
  const stats = usePipelineStats();

  const hotOpps = opportunities.filter((o: any) => !o.is_dismissed);
  const latestPerf = perfSnapshots[0];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales Engine</h1>
          <p className="text-sm text-muted-foreground">AI-powered sales automation and opportunity management</p>
        </div>

        {/* KPI Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-orange-500/10 p-2"><Flame className="h-5 w-5 text-orange-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{hotOpps.length}</p>
                <p className="text-xs text-muted-foreground">Hot Opportunities</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-blue-500/10 p-2"><Send className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{outreach.filter((o) => o.status === "sent").length}</p>
                <p className="text-xs text-muted-foreground">Outreach Sent</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-500/10 p-2"><DollarSign className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">${stats.totalValue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Pipeline Value</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-purple-500/10 p-2"><TrendingUp className="h-5 w-5 text-purple-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.winRate}%</p>
                <p className="text-xs text-muted-foreground">Win Rate</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="opportunities">
          <TabsList>
            <TabsTrigger value="opportunities"><Flame className="h-3.5 w-3.5 mr-1" />Hot Leads</TabsTrigger>
            <TabsTrigger value="outreach"><Send className="h-3.5 w-3.5 mr-1" />Outreach</TabsTrigger>
            <TabsTrigger value="automation"><Zap className="h-3.5 w-3.5 mr-1" />Automation</TabsTrigger>
            <TabsTrigger value="performance"><BarChart3 className="h-3.5 w-3.5 mr-1" />Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Flame className="h-5 w-5 text-orange-500" /> Hot Opportunities
                </CardTitle>
                <CardDescription>AI-ranked leads by engagement, estimated value, and urgency signals</CardDescription>
              </CardHeader>
              <CardContent>
                {hotOpps.length === 0 ? (
                  <div className="text-center py-8">
                    <Target className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No hot opportunities detected yet</p>
                    <p className="text-xs text-muted-foreground mt-1">AI will identify opportunities from your channels, campaigns, and visitor activity</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {hotOpps.map((opp: any) => (
                      <div key={opp.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={opp.urgency === "high" ? "destructive" : opp.urgency === "medium" ? "default" : "secondary"} className="text-xs">
                              {opp.urgency} urgency
                            </Badge>
                            <span className="text-xs text-muted-foreground">Score: {Math.round(opp.score)}</span>
                          </div>
                          <p className="text-sm font-medium text-foreground">{opp.recommended_action || "Review opportunity"}</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {(opp.signals || []).slice(0, 3).map((s: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-lg font-bold text-foreground">${(opp.estimated_value || 0).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">est. value</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="outreach">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Sales Outreach</CardTitle>
                    <CardDescription>AI-generated outreach sequences across email, chat, and call scripts</CardDescription>
                  </div>
                  <Button size="sm"><Zap className="h-4 w-4 mr-1" /> Generate Outreach</Button>
                </div>
              </CardHeader>
              <CardContent>
                {outreach.length === 0 ? (
                  <div className="text-center py-8">
                    <Send className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No outreach created yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {outreach.map((o) => (
                      <div key={o.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">{o.outreach_type}</Badge>
                          <div>
                            <p className="text-sm font-medium text-foreground">{o.subject || "No subject"}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{o.content.slice(0, 80)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {o.ai_generated && <Badge variant="secondary" className="text-[10px]">AI</Badge>}
                          <Badge variant={o.status === "sent" ? "default" : o.status === "scheduled" ? "outline" : "secondary"} className="text-xs">
                            {o.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pipeline Automation Rules</CardTitle>
                  <CardDescription>Auto-move deals based on activity signals</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Move to 'Contacted' after first outreach sent", active: true },
                    { label: "Move to 'Qualified' on positive reply", active: true },
                    { label: "Move to 'Proposal' after 3+ interactions", active: false },
                    { label: "Notify on high-value deal stagnation (7+ days)", active: true },
                    { label: "Auto-archive lost deals after 30 days", active: false },
                  ].map((rule, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <span className="text-sm text-foreground">{rule.label}</span>
                      <Badge variant={rule.active ? "default" : "secondary"} className="text-xs">
                        {rule.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Auto-Discovery Sources</CardTitle>
                  <CardDescription>Where AI looks for new leads</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { source: "Channel Conversations", status: "active", count: 12 },
                    { source: "Campaign Interactions", status: "active", count: 8 },
                    { source: "Website Visitors", status: "active", count: 24 },
                    { source: "Call Center Inquiries", status: "active", count: 5 },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-foreground">{s.source}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{s.count} this week</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sales Performance</CardTitle>
                <CardDescription>Track outreach success, deal velocity, and AI-attributed revenue</CardDescription>
              </CardHeader>
              <CardContent>
                {latestPerf ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-border p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">{latestPerf.outreach_sent}</p>
                      <p className="text-xs text-muted-foreground">Outreach Sent</p>
                    </div>
                    <div className="rounded-lg border border-border p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">
                        {latestPerf.outreach_sent > 0 ? Math.round((latestPerf.outreach_responded / latestPerf.outreach_sent) * 100) : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">Response Rate</p>
                    </div>
                    <div className="rounded-lg border border-border p-4 text-center">
                      <p className="text-2xl font-bold text-foreground">{latestPerf.avg_deal_velocity_days?.toFixed(1) ?? "—"}d</p>
                      <p className="text-xs text-muted-foreground">Avg Deal Velocity</p>
                    </div>
                    <div className="rounded-lg border border-border p-4 text-center">
                      <p className="text-2xl font-bold text-green-500">${(latestPerf.ai_assisted_revenue || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">AI-Assisted Revenue</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Performance data will appear as sales activity accumulates</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SalesEngine;
