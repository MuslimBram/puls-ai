import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTelephony, TelephonyStatus } from "@/hooks/useTelephony";
import { CallQueueManager } from "@/components/telephony/CallQueueManager";
import { CallHistoryContent } from "@/components/CallHistoryContent";
import { RecordingPlayer } from "@/components/telephony/RecordingPlayer";
import { IvrBuilderPanel } from "@/components/telephony/IvrBuilderPanel";
import { SupervisorPanel } from "@/components/telephony/SupervisorPanel";
import { DialerCampaignPanel } from "@/components/telephony/DialerCampaignPanel";
import { TelephonyAnalyticsPanel } from "@/components/telephony/TelephonyAnalyticsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Phone, PhoneIncoming, PhoneOutgoing, Users, Clock, Activity, Headphones, BarChart3,
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

const Telephony = () => {
  const { agentState, activeCalls, queues } = useTelephony();

  const stats = {
    totalActive: activeCalls.filter((c) => ["in_progress", "on_hold"].includes(c.status)).length,
    queued: activeCalls.filter((c) => c.status === "queued").length,
    ringing: activeCalls.filter((c) => c.status === "ringing").length,
    todayHandled: agentState?.calls_handled_today ?? 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Headphones className="h-5 w-5" /> Contact Center
          </h1>
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", statusColors[agentState?.telephony_status || "offline"])} />
            <span className="text-xs text-muted-foreground capitalize">
              {agentState?.telephony_status?.replace("_", " ") || "Offline"}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{stats.totalActive}</p>
                <p className="text-[10px] text-muted-foreground">Active Calls</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/10">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{stats.queued}</p>
                <p className="text-[10px] text-muted-foreground">In Queue</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                <PhoneIncoming className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{stats.ringing}</p>
                <p className="text-[10px] text-muted-foreground">Ringing</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                <Activity className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{stats.todayHandled}</p>
                <p className="text-[10px] text-muted-foreground">Handled Today</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="live" className="space-y-3">
          <TabsList className="h-8 flex-wrap">
            <TabsTrigger value="live" className="text-xs h-6">Live Calls</TabsTrigger>
            <TabsTrigger value="queues" className="text-xs h-6">Queues</TabsTrigger>
            <TabsTrigger value="recordings" className="text-xs h-6">Recordings</TabsTrigger>
            <TabsTrigger value="ivr" className="text-xs h-6">IVR Builder</TabsTrigger>
            <TabsTrigger value="supervisor" className="text-xs h-6">Supervisor</TabsTrigger>
            <TabsTrigger value="dialer" className="text-xs h-6">Dialer</TabsTrigger>
            <TabsTrigger value="history" className="text-xs h-6">History</TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs h-6">Analytics</TabsTrigger>

          <TabsContent value="live" className="space-y-3">
            {activeCalls.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No active calls. Use the softphone in the header to make or receive calls.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {activeCalls.map((call) => (
                  <Card key={call.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      {call.direction === "inbound" ? (
                        <PhoneIncoming className="h-4 w-4 text-primary" />
                      ) : (
                        <PhoneOutgoing className="h-4 w-4 text-accent-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {call.caller_name || (call.direction === "outbound" ? call.callee_number : call.caller_number)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {call.direction} · {call.caller_number}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]",
                          call.status === "in_progress" && "border-green-500/50 text-green-600",
                          call.status === "ringing" && "border-destructive/50 text-destructive animate-pulse",
                          call.status === "queued" && "border-yellow-500/50 text-yellow-600",
                          call.status === "on_hold" && "border-orange-500/50 text-orange-600",
                        )}
                      >
                        {call.status.replace("_", " ")}
                      </Badge>
                      {call.agent_user_id && (
                        <Badge variant="secondary" className="text-[10px]">
                          <Users className="h-3 w-3 mr-0.5" /> Agent
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="queues">
            <CallQueueManager />
          </TabsContent>

          <TabsContent value="recordings">
            <RecordingPlayer showControls={false} />
          </TabsContent>

          <TabsContent value="ivr">
            <IvrBuilderPanel />
          </TabsContent>

          <TabsContent value="supervisor">
            <SupervisorPanel />
          </TabsContent>

          <TabsContent value="dialer">
            <DialerCampaignPanel />
          </TabsContent>

          <TabsContent value="history">
            <CallHistoryContent />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Telephony;
