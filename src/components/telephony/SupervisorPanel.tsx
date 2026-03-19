import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSupervisorMonitor } from "@/hooks/useSupervisorMonitor";
import { useTelephony, TelephonyStatus } from "@/hooks/useTelephony";
import {
  Eye, EyeOff, Headphones, MessageSquare, PhoneForwarded,
  User, Phone, Activity,
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

export const SupervisorPanel = () => {
  const { agents, sessions, startMonitoring, changeMode, stopMonitoring, isLoading } = useSupervisorMonitor();
  const { activeCalls } = useTelephony();

  const getAgentCall = (userId: string) =>
    activeCalls.find((c) => c.agent_user_id === userId && ["in_progress", "on_hold"].includes(c.status));

  const getActiveSession = (agentUserId: string) =>
    sessions.find((s) => s.agent_user_id === agentUserId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4" /> Supervisor Monitor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading agents...</p>
        ) : agents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No agents online.</p>
        ) : (
          <div className="space-y-2">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-md border border-border p-2 text-center">
                <p className="text-lg font-bold text-foreground">{agents.filter((a) => a.telephony_status === "online").length}</p>
                <p className="text-[10px] text-muted-foreground">Available</p>
              </div>
              <div className="rounded-md border border-border p-2 text-center">
                <p className="text-lg font-bold text-foreground">{agents.filter((a) => a.telephony_status === "on_call").length}</p>
                <p className="text-[10px] text-muted-foreground">On Call</p>
              </div>
              <div className="rounded-md border border-border p-2 text-center">
                <p className="text-lg font-bold text-foreground">{agents.reduce((sum, a) => sum + (a.calls_handled_today || 0), 0)}</p>
                <p className="text-[10px] text-muted-foreground">Total Calls</p>
              </div>
            </div>

            {/* Agent list */}
            {agents.map((agent) => {
              const agentCall = getAgentCall(agent.user_id);
              const session = getActiveSession(agent.user_id);

              return (
                <div key={agent.user_id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {agent.sip_extension || agent.user_id.slice(0, 8)}
                      </p>
                      <div className="flex items-center gap-1">
                        <span className={cn("h-1.5 w-1.5 rounded-full", statusColors[agent.telephony_status] || "bg-muted")} />
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {agent.telephony_status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {agent.calls_handled_today || 0} calls
                    </Badge>
                  </div>

                  {/* Active call info */}
                  {agentCall && (
                    <div className="flex items-center gap-2 rounded-md bg-primary/5 p-2">
                      <Phone className="h-3 w-3 text-primary" />
                      <span className="text-[10px] text-foreground flex-1 truncate">
                        {agentCall.direction === "inbound" ? agentCall.caller_number : agentCall.callee_number}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{agentCall.status.replace("_", " ")}</Badge>
                    </div>
                  )}

                  {/* Monitor controls */}
                  <div className="flex items-center gap-1">
                    {session ? (
                      <>
                        <Select
                          value={session.mode}
                          onValueChange={(mode) => changeMode.mutate({ sessionId: session.id, mode: mode as any })}
                        >
                          <SelectTrigger className="h-6 text-[10px] w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="listen" className="text-xs">
                              <span className="flex items-center gap-1"><Headphones className="h-3 w-3" /> Listen</span>
                            </SelectItem>
                            <SelectItem value="whisper" className="text-xs">
                              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Whisper</span>
                            </SelectItem>
                            <SelectItem value="barge" className="text-xs">
                              <span className="flex items-center gap-1"><PhoneForwarded className="h-3 w-3" /> Barge</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={() => stopMonitoring.mutate(session.id)}
                        >
                          <EyeOff className="h-3 w-3 mr-0.5" /> Stop
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px]"
                        disabled={agent.telephony_status !== "on_call"}
                        onClick={() => startMonitoring.mutate({
                          agentUserId: agent.user_id,
                          activeCallId: agentCall?.id,
                        })}
                      >
                        <Eye className="h-3 w-3 mr-0.5" /> Monitor
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
