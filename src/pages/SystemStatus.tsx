import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { CheckCircle2, AlertTriangle, XCircle, Wifi, Bot, Clock, Server, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SystemStatus = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const navigate = useNavigate();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["system-status", user?.id, workspace?.id],
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [channels, automations, autoLogs, apiErrors, msgs] = await Promise.all([
        supabase.from("channels").select("channel_type, connection_status, is_enabled").eq("user_id", user!.id),
        supabase.from("automation_workflows").select("id, is_active").eq("user_id", user!.id),
        supabase.from("automation_logs").select("status").eq("user_id", user!.id).gte("created_at", dayAgo),
        supabase.from("api_error_log").select("endpoint, status_code, created_at").gte("created_at", dayAgo).limit(20).order("created_at", { ascending: false }),
        supabase.from("inbox_messages").select("id", { count: "exact", head: true }).eq("user_id", user!.id).gte("created_at", dayAgo),
      ]);

      const ch = channels.data ?? [];
      const connected = ch.filter((c) => c.connection_status === "connected" && c.is_enabled).length;
      const total = ch.length;
      const logs = autoLogs.data ?? [];
      const failed = logs.filter((l) => l.status === "error").length;

      return {
        channels: { connected, total, list: ch },
        automations: { total: (automations.data ?? []).length, active: (automations.data ?? []).filter((a) => a.is_active).length, runs: logs.length, failed },
        apiErrors: apiErrors.data ?? [],
        msgs24h: msgs.count ?? 0,
      };
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  if (isLoading || !data) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      </DashboardLayout>
    );
  }

  const channelHealth = data.channels.total > 0 ? Math.round((data.channels.connected / data.channels.total) * 100) : 0;
  const automationHealth = data.automations.runs > 0 ? Math.round(((data.automations.runs - data.automations.failed) / data.automations.runs) * 100) : 100;
  const overallOk = channelHealth >= 50 && automationHealth >= 80 && data.apiErrors.length < 5;

  const statusBadge = (pct: number) => {
    if (pct >= 80) return <Badge className="bg-primary/15 text-primary hover:bg-primary/15"><CheckCircle2 className="h-3 w-3 mr-1" />Healthy</Badge>;
    if (pct >= 50) return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>;
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Action needed</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Server className="h-6 w-6" /> System Status</h1>
            <p className="text-sm text-muted-foreground mt-1">A live overview of how your channels, automations, and integrations are performing.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <Card className={overallOk ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}>
          <CardContent className="flex items-center gap-4 py-5">
            {overallOk ? <CheckCircle2 className="h-10 w-10 text-primary" /> : <AlertTriangle className="h-10 w-10 text-destructive" />}
            <div className="flex-1">
              <p className="font-semibold text-lg">{overallOk ? "All systems operational" : "Some systems need your attention"}</p>
              <p className="text-sm text-muted-foreground">{data.msgs24h} messages received in the last 24 hours.</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Wifi className="h-4 w-4" /> Channels</CardTitle>
                {statusBadge(channelHealth)}
              </div>
              <CardDescription className="text-xs">{data.channels.connected} of {data.channels.total} connected and active</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={channelHealth} className="h-2" />
              <div className="space-y-1">
                {data.channels.list.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{c.channel_type}</span>
                    <Badge variant={c.connection_status === "connected" ? "default" : "outline"} className="text-[10px] h-5">{c.connection_status || "—"}</Badge>
                  </div>
                ))}
              </div>
              {channelHealth < 100 && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/channels")}>Fix Connections</Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4" /> Automations</CardTitle>
                {statusBadge(automationHealth)}
              </div>
              <CardDescription className="text-xs">{data.automations.active} active · {data.automations.runs} runs (24h) · {data.automations.failed} failed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={automationHealth} className="h-2" />
              {data.automations.failed > 0 && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/automations")}>Review Failures</Button>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Recent API Errors (24h)</CardTitle>
              <Badge variant={data.apiErrors.length === 0 ? "default" : "destructive"}>{data.apiErrors.length}</Badge>
            </div>
            <CardDescription className="text-xs">Errors from third-party integrations and edge functions</CardDescription>
          </CardHeader>
          <CardContent>
            {data.apiErrors.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No errors in the last 24 hours 🎉</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {data.apiErrors.map((e: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/40">
                    <span className="font-mono truncate flex-1">{e.endpoint}</span>
                    <Badge variant="destructive" className="text-[10px] ml-2">{e.status_code || "ERR"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SystemStatus;
