import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTelephony } from "@/hooks/useTelephony";
import { useTelephonyAnalytics } from "@/hooks/useTelephonyAnalytics";
import { useSupervisorMonitor } from "@/hooks/useSupervisorMonitor";
import {
  Phone, PhoneIncoming, PhoneOutgoing, Users, Clock,
  Activity, Headphones, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  online: "bg-green-500",
  busy: "bg-yellow-500",
  on_call: "bg-red-500",
  wrap_up: "bg-orange-500",
  offline: "bg-muted-foreground/40",
  dnd: "bg-destructive",
};

export const WallboardPanel = () => {
  const { activeCalls } = useTelephony();
  const { data: metrics } = useTelephonyAnalytics(1);
  const { agents } = useSupervisorMonitor();

  const activeNow = activeCalls.filter((c) => ["in_progress", "on_hold"].includes(c.status)).length;
  const queued = activeCalls.filter((c) => c.status === "queued").length;
  const ringing = activeCalls.filter((c) => c.status === "ringing").length;
  const agentsOnline = agents.filter((a) => a.telephony_status === "online").length;
  const agentsOnCall = agents.filter((a) => a.telephony_status === "on_call").length;
  const agentsBusy = agents.filter((a) => ["busy", "wrap_up", "dnd"].includes(a.telephony_status)).length;

  const tiles = [
    { label: "Active Calls", value: activeNow, icon: Phone, color: "text-primary", bg: "bg-primary/10" },
    { label: "In Queue", value: queued, icon: Clock, color: queued > 5 ? "text-destructive" : "text-yellow-600", bg: queued > 5 ? "bg-destructive/10" : "bg-yellow-500/10" },
    { label: "Ringing", value: ringing, icon: PhoneIncoming, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Agents Online", value: agentsOnline, icon: Users, color: "text-green-600", bg: "bg-green-500/10" },
    { label: "Agents On Call", value: agentsOnCall, icon: Headphones, color: "text-primary", bg: "bg-primary/10" },
    { label: "Agents Busy", value: agentsBusy, icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-500/10" },
    { label: "Today Inbound", value: metrics?.inboundCalls ?? 0, icon: PhoneIncoming, color: "text-primary", bg: "bg-primary/10" },
    { label: "Today Outbound", value: metrics?.outboundCalls ?? 0, icon: PhoneOutgoing, color: "text-accent-foreground", bg: "bg-accent/10" },
    { label: "Avg Duration", value: metrics ? `${Math.floor(metrics.avgDuration / 60)}:${String(metrics.avgDuration % 60).padStart(2, "0")}` : "0:00", icon: Activity, color: "text-yellow-600", bg: "bg-yellow-500/10" },
  ];

  return (
    <div className="space-y-4">
      {/* Big metrics grid */}
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="flex flex-col items-center justify-center p-4 text-center">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-full mb-2", t.bg)}>
                <t.icon className={cn("h-5 w-5", t.color)} />
              </div>
              <p className="text-2xl font-bold text-foreground">{t.value}</p>
              <p className="text-xs text-muted-foreground">{t.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live agents strip */}
      <Card>
        <CardContent className="p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Agent Status Board</p>
          <div className="flex flex-wrap gap-2">
            {agents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No agents registered.</p>
            ) : (
              agents.map((a) => (
                <div key={a.user_id} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
                  <span className={cn("h-2 w-2 rounded-full", statusColors[a.telephony_status] || "bg-muted")} />
                  <span className="text-xs font-medium text-foreground">{a.sip_extension || a.user_id.slice(0, 6)}</span>
                  <Badge variant="secondary" className="text-[9px] h-4">{a.calls_handled_today || 0}</Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active calls live feed */}
      {activeCalls.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Live Calls</p>
            <div className="space-y-1">
              {activeCalls.map((call) => (
                <div key={call.id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-0">
                  {call.direction === "inbound" ? (
                    <PhoneIncoming className="h-3 w-3 text-primary shrink-0" />
                  ) : (
                    <PhoneOutgoing className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-foreground font-medium truncate flex-1">
                    {call.caller_name || (call.direction === "outbound" ? call.callee_number : call.caller_number)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("text-[9px]",
                      call.status === "in_progress" && "border-green-500/50 text-green-600",
                      call.status === "ringing" && "border-destructive/50 text-destructive",
                      call.status === "queued" && "border-yellow-500/50 text-yellow-600",
                      call.status === "on_hold" && "border-orange-500/50 text-orange-600",
                    )}
                  >
                    {call.status.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
