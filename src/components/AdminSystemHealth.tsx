import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Database, Wifi, Bot, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export const AdminSystemHealth = () => {
  const { data: health, isLoading } = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: async () => {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [leads, channels, subs, automationLogs, aiConvos] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", dayAgo.toISOString()),
        supabase.from("channels").select("id, connection_status, is_enabled"),
        supabase.from("subscriptions").select("plan, ai_replies_today, leads_used"),
        supabase.from("automation_logs").select("status").gte("created_at", dayAgo.toISOString()),
        supabase.from("ai_conversations").select("*", { count: "exact", head: true }).gte("created_at", dayAgo.toISOString()),
      ]);

      const channelData = channels.data ?? [];
      const connectedChannels = channelData.filter((c) => c.connection_status === "connected" && c.is_enabled).length;
      const totalChannels = channelData.length;

      const logs = automationLogs.data ?? [];
      const failedAutomations = logs.filter((l) => l.status === "error").length;

      const subData = subs.data ?? [];
      const totalAiToday = subData.reduce((s, sub) => s + (sub.ai_replies_today || 0), 0);
      const totalLeadsUsed = subData.reduce((s, sub) => s + (sub.leads_used || 0), 0);

      return {
        leadsToday: leads.count ?? 0,
        aiCallsToday: aiConvos.count ?? 0,
        totalAiRepliesToday: totalAiToday,
        totalLeadsUsed,
        connectedChannels,
        totalChannels,
        automationsRun: logs.length,
        automationsFailed: failedAutomations,
        activeUsers: subData.length,
      };
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  const h = health!;
  const channelHealth = h.totalChannels > 0 ? Math.round((h.connectedChannels / h.totalChannels) * 100) : 0;
  const automationHealth = h.automationsRun > 0 ? Math.round(((h.automationsRun - h.automationsFailed) / h.automationsRun) * 100) : 100;

  const metrics = [
    { label: "Leads (24h)", value: h.leadsToday, icon: Activity, color: "text-primary" },
    { label: "AI Conversations (24h)", value: h.aiCallsToday, icon: Bot, color: "text-primary" },
    { label: "AI Replies Today", value: h.totalAiRepliesToday, icon: Clock, color: "text-primary" },
    { label: "Active Subscriptions", value: h.activeUsers, icon: Database, color: "text-primary" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <m.icon className={`h-5 w-5 ${m.color}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wifi className="h-4 w-4" /> Channel Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{h.connectedChannels}/{h.totalChannels} connected</span>
              <Badge variant={channelHealth >= 80 ? "default" : "destructive"} className="text-xs">
                {channelHealth}%
              </Badge>
            </div>
            <Progress value={channelHealth} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {automationHealth >= 90 ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
              Automation Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{h.automationsFailed} failed / {h.automationsRun} total (24h)</span>
              <Badge variant={automationHealth >= 90 ? "default" : "destructive"} className="text-xs">
                {automationHealth}%
              </Badge>
            </div>
            <Progress value={automationHealth} className="h-2" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
