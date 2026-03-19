import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTelephony, TelephonyStatus } from "@/hooks/useTelephony";
import {
  Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Pause, Play,
  ArrowRightLeft, X, Circle, Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DIAL_PAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

const statusColors: Record<TelephonyStatus, string> = {
  online: "bg-green-500",
  busy: "bg-yellow-500",
  on_call: "bg-red-500",
  wrap_up: "bg-orange-500",
  offline: "bg-muted-foreground/40",
  dnd: "bg-destructive",
};

const statusLabels: Record<TelephonyStatus, string> = {
  online: "Available",
  busy: "Busy",
  on_call: "On Call",
  wrap_up: "Wrap Up",
  offline: "Offline",
  dnd: "Do Not Disturb",
};

export const SoftphoneWidget = () => {
  const {
    agentState, myCall, callTimer, formatTimer,
    setAgentStatus, initiateCall, answerCall, toggleHold, endCall, transferCall,
    activeCalls,
  } = useTelephony();

  const [dialNumber, setDialNumber] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferNumber, setTransferNumber] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const currentStatus = (agentState?.telephony_status as TelephonyStatus) || "offline";
  const incomingCalls = activeCalls.filter(
    (c) => c.status === "ringing" && c.direction === "inbound" && !c.agent_user_id
  );

  const handleDial = (digit: string) => {
    setDialNumber((prev) => prev + digit);
  };

  const handleCall = () => {
    if (!dialNumber.trim()) return;
    initiateCall.mutate({ number: dialNumber.trim() });
    setDialNumber("");
  };

  const handleTransfer = () => {
    if (myCall && transferNumber.trim()) {
      transferCall.mutate({ callId: myCall.id, targetNumber: transferNumber.trim() });
      setShowTransfer(false);
      setTransferNumber("");
    }
  };

  const handleStatusChange = (status: TelephonyStatus) => {
    setAgentStatus.mutate(status);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
        >
          <Headphones className="h-4 w-4" />
          <span className={cn("absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card", statusColors[currentStatus])} />
          {incomingCalls.length > 0 && (
            <span className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground animate-pulse">
              {incomingCalls.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" sideOffset={8}>
        {/* Header with agent status */}
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", statusColors[currentStatus])} />
            <span className="text-xs font-medium text-foreground">{statusLabels[currentStatus]}</span>
          </div>
          <div className="flex gap-1">
            {(["online", "busy", "dnd", "offline"] as TelephonyStatus[]).map((s) => (
              <Tooltip key={s}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-all",
                      currentStatus === s ? "border-foreground scale-110" : "border-transparent opacity-60 hover:opacity-100",
                      statusColors[s]
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{statusLabels[s]}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Incoming call alert */}
        {incomingCalls.map((call) => (
          <div key={call.id} className="border-b border-border bg-primary/5 p-3 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <PhoneIncoming className="h-4 w-4 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{call.caller_name || call.caller_number}</p>
                <p className="text-[10px] text-muted-foreground">{call.caller_number}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => answerCall.mutate(call.id)}>
                <Phone className="h-3 w-3 mr-1" /> Answer
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => endCall.mutate(call.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}

        {/* Active call controls */}
        {myCall && (
          <div className="border-b border-border p-3 space-y-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{myCall.direction === "inbound" ? "Inbound" : "Outbound"}</p>
              <p className="text-sm font-medium text-foreground">
                {myCall.caller_name || (myCall.direction === "outbound" ? myCall.callee_number : myCall.caller_number)}
              </p>
              <p className="text-lg font-mono font-bold text-primary">{formatTimer(callTimer)}</p>
              {myCall.status === "on_hold" && (
                <Badge variant="outline" className="text-[10px] mt-1 border-yellow-500/50 text-yellow-600">ON HOLD</Badge>
              )}
            </div>

            {/* Call controls */}
            <div className="flex items-center justify-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isMuted ? "destructive" : "outline"}
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{isMuted ? "Unmute" : "Mute"}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={myCall.status === "on_hold" ? "secondary" : "outline"}
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => toggleHold.mutate(myCall.id)}
                  >
                    {myCall.status === "on_hold" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{myCall.status === "on_hold" ? "Resume" : "Hold"}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => setShowTransfer(!showTransfer)}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Transfer</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => endCall.mutate(myCall.id)}
                  >
                    <PhoneOff className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">End Call</TooltipContent>
              </Tooltip>
            </div>

            {showTransfer && (
              <div className="flex gap-1">
                <Input
                  value={transferNumber}
                  onChange={(e) => setTransferNumber(e.target.value)}
                  placeholder="Transfer to..."
                  className="h-7 text-xs"
                />
                <Button size="sm" className="h-7 text-xs" onClick={handleTransfer}>Go</Button>
              </div>
            )}
          </div>
        )}

        {/* Dial pad (show when no active call) */}
        {!myCall && (
          <div className="p-3 space-y-2">
            <Input
              value={dialNumber}
              onChange={(e) => setDialNumber(e.target.value)}
              placeholder="Enter number..."
              className="h-8 text-center text-sm font-mono"
            />
            <div className="grid grid-cols-3 gap-1">
              {DIAL_PAD.flat().map((digit) => (
                <Button
                  key={digit}
                  variant="ghost"
                  className="h-9 text-sm font-medium"
                  onClick={() => handleDial(digit)}
                >
                  {digit}
                </Button>
              ))}
            </div>
            <div className="flex gap-1">
              <Button
                className="flex-1 h-8 text-xs"
                disabled={!dialNumber.trim() || currentStatus === "offline"}
                onClick={handleCall}
              >
                <Phone className="h-3 w-3 mr-1" /> Call
              </Button>
              {dialNumber && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDialNumber("")}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Stats footer */}
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <span>Today: {agentState?.calls_handled_today ?? 0} calls</span>
          <span>Queue: {activeCalls.filter((c) => c.status === "queued").length} waiting</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};
