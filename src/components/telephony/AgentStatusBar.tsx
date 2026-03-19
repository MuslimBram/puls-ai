import { useTelephony, TelephonyStatus } from "@/hooks/useTelephony";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Phone, PhoneIncoming, Users } from "lucide-react";

const statusConfig: Record<TelephonyStatus, { color: string; label: string }> = {
  online: { color: "bg-green-500", label: "Available" },
  busy: { color: "bg-yellow-500", label: "Busy" },
  on_call: { color: "bg-red-500", label: "On Call" },
  wrap_up: { color: "bg-orange-500", label: "Wrap Up" },
  offline: { color: "bg-muted-foreground/40", label: "Offline" },
  dnd: { color: "bg-destructive", label: "DND" },
};

export const AgentStatusBar = () => {
  const { agentState, activeCalls, myCall, callTimer, formatTimer } = useTelephony();

  const status = (agentState?.telephony_status as TelephonyStatus) || "offline";
  const config = statusConfig[status];
  const queuedCalls = activeCalls.filter((c) => c.status === "queued").length;
  const incomingCalls = activeCalls.filter((c) => c.status === "ringing" && c.direction === "inbound").length;

  return (
    <div className="flex items-center gap-3 text-xs">
      {/* Agent status indicator */}
      <div className="flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", config.color)} />
        <span className="text-muted-foreground">{config.label}</span>
      </div>

      {/* Active call info */}
      {myCall && (
        <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary animate-pulse">
          <Phone className="h-3 w-3" />
          {formatTimer(callTimer)}
        </Badge>
      )}

      {/* Queue stats */}
      {queuedCalls > 0 && (
        <Badge variant="outline" className="text-[10px] gap-1 border-yellow-500/30 text-yellow-600">
          <Users className="h-3 w-3" /> {queuedCalls} queued
        </Badge>
      )}

      {incomingCalls > 0 && (
        <Badge variant="outline" className="text-[10px] gap-1 border-destructive/30 text-destructive animate-pulse">
          <PhoneIncoming className="h-3 w-3" /> {incomingCalls} ringing
        </Badge>
      )}
    </div>
  );
};
