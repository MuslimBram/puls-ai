/**
 * Main telephony hook — composes sub-modules for device management,
 * queries, realtime, and call actions.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useTwilioDevice } from "./telephony/useTwilioDevice";
import { useAgentState, useActiveCalls, useCallQueues, useTelephonyRealtime } from "./telephony/useTelephonyQueries";
import { useCallActions } from "./telephony/useCallActions";

// Re-export types for consumers
export type { ActiveCall, AgentTelephonyState, CallQueue, TelephonyStatus, CallStatus } from "./telephony/types";

export const useTelephony = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check VoIP provider config
  const voipConfigQuery = useQuery({
    queryKey: ["voip-config", workspace?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("channels").select("id, settings")
        .eq("workspace_id", workspace!.id).eq("channel_type", "voip").eq("is_enabled", true)
        .maybeSingle();
      return data;
    },
    enabled: !!workspace,
  });

  const hasRealProvider = !!voipConfigQuery.data?.settings;
  const hasWebRtcCredentials = !!((voipConfigQuery.data?.settings as Record<string, string>)?.api_key_sid);

  // Sub-modules
  const { deviceReady, twilioDevice } = useTwilioDevice(hasWebRtcCredentials, workspace?.id, user?.id);
  const agentStateQuery = useAgentState();
  const activeCallsQuery = useActiveCalls();
  const queuesQuery = useCallQueues();
  useTelephonyRealtime();

  const myCall = activeCallsQuery.data?.find(
    (c) => c.agent_user_id === user?.id && ["in_progress", "on_hold", "ringing"].includes(c.status),
  );

  const {
    setAgentStatus, initiateCall, answerCall, toggleHold, endCall, transferCall, toggleMute,
  } = useCallActions(
    activeCallsQuery.data ?? [],
    agentStateQuery.data,
    hasRealProvider,
    deviceReady,
    twilioDevice,
    setIsMuted,
  );

  // Call timer
  useEffect(() => {
    if (myCall && myCall.status === "in_progress" && myCall.answered_at) {
      timerRef.current = setInterval(() => {
        setCallTimer(Math.floor((Date.now() - new Date(myCall.answered_at!).getTime()) / 1000));
      }, 1000);
    } else {
      setCallTimer(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [myCall?.id, myCall?.status]);

  const formatTimer = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, []);

  return {
    agentState: agentStateQuery.data,
    activeCalls: activeCallsQuery.data ?? [],
    myCall,
    queues: queuesQuery.data ?? [],
    callTimer,
    formatTimer,
    hasRealProvider,
    hasWebRtcCredentials,
    deviceReady,
    isMuted,
    toggleMute,
    setAgentStatus,
    initiateCall,
    answerCall,
    toggleHold,
    endCall,
    transferCall,
    isLoading: agentStateQuery.isLoading,
  };
};
