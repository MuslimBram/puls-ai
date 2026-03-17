import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAgentPerformance,
  useChannelPerformance,
  useFunnelAnalytics,
  useAIPerformanceMetrics,
  useExecutiveSummary,
  useWorkforceDashboard,
  type OpsRange,
} from "@/hooks/useOperationalIntelligence";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Users, MessageSquare, TrendingUp, Zap, Activity, AlertTriangle,
  Clock, Target, ArrowRight, Shield, Brain, BarChart3,
} from "lucide-react";

const KpiCard = ({ label, value, icon: Icon, sub, accent }: {
  label: string; value: string | number; icon: any; sub?: string; accent?: string;
}) => (
  <Card>
    <CardContent className="flex items-center gap-3 pt-4 pb-4">
      <div className={`rounded-lg p-2 ${accent ?? "bg-primary/10"}`}>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </CardContent>
  </Card>
);

const FunnelBar = ({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export const OperationalDashboard = () => {
  const [range, setRange] = useState<OpsRange>("30d");
  const { workspace } = useWorkspace();
  const wsId = workspace?.id ?? null;

  const { data: agents } = useAgentPerformance(range);
  const { data: channels } = useChannelPerformance(range);
  const { data: funnel } = useFunnelAnalytics(range);
  const { data: ai } = useAIPerformanceMetrics(range);
  const { data: exec } = useExecutiveSummary();
  const { data: workforce } = useWorkforceDashboard(wsId);

  return (
    <div className="space-y-6">
      {/* Range Filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Operational Intelligence
        </h2>
        <Select value={range} onValueChange={(v) => setRange(v as OpsRange)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 days</SelectItem>
            <SelectItem value="14d">14 days</SelectItem>
            <SelectItem value="30d">30 days</SelectItem>
            <SelectItem value="90d">90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Executive Summary */}
      {exec && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
          <KpiCard label="Leads Today" value={exec.leads_today} icon={Target} />
          <KpiCard label="Open Conversations" value={exec.open_conversations} icon={MessageSquare} />
          <KpiCard label="Revenue Potential (30d)" value={`$${(exec.revenue_potential_30d ?? 0).toLocaleString()}`} icon={TrendingUp} />
          <KpiCard label="Churn Alerts" value={exec.churn_risk_alerts} icon={AlertTriangle} accent="bg-destructive/10" />
          <KpiCard label="SLA Breaches" value={exec.sla_breaches_active} icon={Clock} accent={exec.sla_breaches_active > 0 ? "bg-destructive/10" : undefined} />
          <KpiCard label="Active Campaigns" value={exec.active_campaigns} icon={Zap} />
        </div>
      )}

      {/* Workforce Status */}
      {workforce && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Workforce Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-center">
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700">
                {workforce.online} online
              </Badge>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700">
                {workforce.idle} idle
              </Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive">
                {workforce.busy} busy
              </Badge>
              <span className="text-sm text-muted-foreground">|</span>
              <span className="text-sm">
                <strong>{workforce.waiting}</strong> conversations waiting
              </span>
              <Badge variant={workforce.overload === "high" ? "destructive" : workforce.overload === "medium" ? "secondary" : "outline"}>
                Load: {workforce.overload}
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto">{workforce.recommendation}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agent Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Agent Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agents && agents.length > 0 ? (
              <div className="space-y-3">
                {agents.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{a.agent_id?.slice(0, 8) ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.conversations_handled} handled · {a.resolved_count} resolved
                      </p>
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                      <p>Avg response: {a.avg_first_response_min ?? "–"}m</p>
                      <p>Resolution: {a.avg_resolution_hours ?? "–"}h</p>
                      {a.sla_breaches > 0 && (
                        <Badge variant="destructive" className="text-[10px]">{a.sla_breaches} SLA breaches</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No agent data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Channel Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Channel Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channels && channels.length > 0 ? (
              <div className="space-y-3">
                {channels.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium capitalize">{c.channel}</p>
                      <p className="text-xs text-muted-foreground">{c.total_messages} messages</p>
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                      <p>Avg response: {c.avg_response_min ?? "–"}m</p>
                      {c.unread_backlog > 0 && (
                        <Badge variant="secondary">{c.unread_backlog} unread</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No channel data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Funnel Analytics */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Sales Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel ? (
              <>
                <FunnelBar label="Leads" value={funnel.total_leads} total={funnel.total_leads} color="bg-blue-500" />
                <div className="flex items-center gap-1 text-xs text-muted-foreground pl-2">
                  <ArrowRight className="h-3 w-3" /> {funnel.lead_to_qualified_pct}% qualify
                </div>
                <FunnelBar label="Qualified" value={funnel.qualified} total={funnel.total_leads} color="bg-yellow-500" />
                <div className="flex items-center gap-1 text-xs text-muted-foreground pl-2">
                  <ArrowRight className="h-3 w-3" /> {funnel.qualified_to_deal_pct}% become deals
                </div>
                <FunnelBar label="Deals" value={funnel.deals} total={funnel.total_leads} color="bg-orange-500" />
                <div className="flex items-center gap-1 text-xs text-muted-foreground pl-2">
                  <ArrowRight className="h-3 w-3" /> {funnel.deal_to_won_pct}% won
                </div>
                <FunnelBar label="Won" value={funnel.won} total={funnel.total_leads} color="bg-green-500" />
                <div className="mt-2 text-xs text-muted-foreground">
                  Deal velocity: <strong>{funnel.avg_deal_velocity_days} days</strong> avg
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No funnel data yet</p>
            )}
          </CardContent>
        </Card>

        {/* AI Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4" /> AI Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ai ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xl font-bold">{ai.total_ai_conversations}</p>
                  <p className="text-xs text-muted-foreground">AI conversations</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{ai.auto_replied}</p>
                  <p className="text-xs text-muted-foreground">Auto-replied</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{ai.auto_reply_rate}%</p>
                  <p className="text-xs text-muted-foreground">Auto-reply rate</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{ai.drafts_generated}</p>
                  <p className="text-xs text-muted-foreground">Drafts generated</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm">
                    Human override ratio: <strong>{ai.human_override_ratio}%</strong>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No AI data yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
