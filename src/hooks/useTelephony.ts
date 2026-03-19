import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";
import { useCallInboxIntegration } from "./useCallInboxIntegration";

export type TelephonyStatus = "online" | "busy" | "on_call" | "wrap_up" | "offline" | "dnd";
export type CallStatus = "ringing" | "queued" | "in_progress" | "on_hold" | "transferring" | "completed" | "failed";

export interface ActiveCall {
  id: string;
  workspace_id: string;
  call_record_id: string | null;
  queue_id: string | null;
  agent_user_id: string | null;
  caller_number: string;
  caller_name: string | null;
  callee_number: string | null;
  direction: string;
  status: CallStatus;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  hold_started_at: string | null;
  total_hold_seconds: number;
  transfer_target: string | null;
  sip_call_id: string | null;
  metadata: Record<string, unknown>;
}

export interface AgentTelephonyState {
  id: string;
  user_id: string;
  workspace_id: string;
  telephony_status: TelephonyStatus;
  current_call_id: string | null;
  last_call_ended_at: string | null;
  calls_handled_today: number;
  avg_handle_time_seconds: number;
  sip_extension: string | null;
  sip_registered: boolean;
}

export interface CallQueue {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  strategy: string;
  max_wait_seconds: number;
  wrap_up_seconds: number;
  is_active: boolean;
  priority: number;
}

export const useTelephony = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [callTimer, setCallTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { createThreadForCall } = useCallInboxIntegration();

  // Agent telephony state
  const agentStateQuery = useQuery({
    queryKey: ["agent-telephony-state", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_telephony_state")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as AgentTelephonyState | null;
    },
    enabled: !!user,
  });

  // Active calls for workspace
  const activeCallsQuery = useQuery({
    queryKey: ["active-calls", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_calls")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .in("status", ["ringing", "queued", "in_progress", "on_hold", "transferring"])
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ActiveCall[];
    },
    enabled: !!workspace,
    refetchInterval: 5000,
  });

  // My current call
  const myCall = activeCallsQuery.data?.find(
    (c) => c.agent_user_id === user?.id && ["in_progress", "on_hold", "ringing"].includes(c.status)
  );

  // Call queues
  const queuesQuery = useQuery({
    queryKey: ["call-queues", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_queues")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .eq("is_active", true)
        .order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CallQueue[];
    },
    enabled: !!workspace,
  });

  // Set agent status
  const setAgentStatus = useMutation({
    mutationFn: async (status: TelephonyStatus) => {
      const { error } = await supabase
        .from("agent_telephony_state")
        .upsert({
          user_id: user!.id,
          workspace_id: workspace!.id,
          telephony_status: status,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-telephony-state"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Initiate outbound call
  const initiateCall = useMutation({
    mutationFn: async (params: { number: string; contactName?: string; dealId?: string }) => {
      // Create active call record
      const { data: call, error } = await supabase
        .from("active_calls")
        .insert({
          workspace_id: workspace!.id,
          agent_user_id: user!.id,
          caller_number: "softphone",
          callee_number: params.number,
          caller_name: params.contactName || null,
          direction: "outbound",
          status: "ringing",
          metadata: params.dealId ? { deal_id: params.dealId } : {},
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Create call record entry
      const { data: record } = await supabase
        .from("call_records")
        .insert({
          user_id: user!.id,
          workspace_id: workspace!.id,
          contact_phone: params.number,
          contact_name: params.contactName || null,
          deal_id: params.dealId || null,
          call_direction: "outbound",
          call_status: "ringing",
          channel_provider: "softphone",
        } as any)
        .select()
        .single();

      if (record) {
        await supabase
          .from("active_calls")
          .update({ call_record_id: record.id } as any)
          .eq("id", (call as any).id);
      }

      // Update agent state
      await supabase
        .from("agent_telephony_state")
        .upsert({
          user_id: user!.id,
          workspace_id: workspace!.id,
          telephony_status: "on_call",
          current_call_id: (call as any).id,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });

      return call as unknown as ActiveCall;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-calls"] });
      qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
      qc.invalidateQueries({ queryKey: ["call-records"] });
      toast.success("Call initiated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Answer call
  const answerCall = useMutation({
    mutationFn: async (callId: string) => {
      const { error } = await supabase
        .from("active_calls")
        .update({
          status: "in_progress",
          agent_user_id: user!.id,
          answered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", callId);
      if (error) throw error;

      await supabase
        .from("agent_telephony_state")
        .upsert({
          user_id: user!.id,
          workspace_id: workspace!.id,
          telephony_status: "on_call",
          current_call_id: callId,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-calls"] });
      qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
    },
  });

  // Hold/unhold
  const toggleHold = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCallsQuery.data?.find((c) => c.id === callId);
      if (!call) throw new Error("Call not found");

      if (call.status === "on_hold") {
        const holdDuration = call.hold_started_at
          ? Math.floor((Date.now() - new Date(call.hold_started_at).getTime()) / 1000)
          : 0;
        const { error } = await supabase
          .from("active_calls")
          .update({
            status: "in_progress",
            hold_started_at: null,
            total_hold_seconds: (call.total_hold_seconds || 0) + holdDuration,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", callId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("active_calls")
          .update({
            status: "on_hold",
            hold_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", callId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-calls"] }),
  });

  // End call
  const endCall = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCallsQuery.data?.find((c) => c.id === callId);
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("active_calls")
        .update({
          status: "completed",
          ended_at: now,
          updated_at: now,
        } as any)
        .eq("id", callId);
      if (error) throw error;

      // Update call record
      if (call?.call_record_id) {
        const duration = call.answered_at
          ? Math.floor((Date.now() - new Date(call.answered_at).getTime()) / 1000)
          : 0;
        await supabase
          .from("call_records")
          .update({
            call_status: "completed",
            call_duration: duration,
            updated_at: now,
          } as any)
          .eq("id", call.call_record_id);
      }

      // Update agent state
      await supabase
        .from("agent_telephony_state")
        .upsert({
          user_id: user!.id,
          workspace_id: workspace!.id,
          telephony_status: "wrap_up",
          current_call_id: null,
          last_call_ended_at: now,
          calls_handled_today: (agentStateQuery.data?.calls_handled_today ?? 0) + 1,
          updated_at: now,
        } as any, { onConflict: "user_id" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-calls"] });
      qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
      qc.invalidateQueries({ queryKey: ["call-records"] });
      toast.info("Call ended");
    },
  });

  // Transfer call
  const transferCall = useMutation({
    mutationFn: async ({ callId, targetNumber }: { callId: string; targetNumber: string }) => {
      const { error } = await supabase
        .from("active_calls")
        .update({
          status: "transferring",
          transfer_target: targetNumber,
          transferred_from: user!.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", callId);
      if (error) throw error;

      // Release agent
      await supabase
        .from("agent_telephony_state")
        .upsert({
          user_id: user!.id,
          workspace_id: workspace!.id,
          telephony_status: "online",
          current_call_id: null,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-calls"] });
      qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
      toast.success("Call transferred");
    },
  });

  // Call timer
  useEffect(() => {
    if (myCall && myCall.status === "in_progress" && myCall.answered_at) {
      timerRef.current = setInterval(() => {
        setCallTimer(Math.floor((Date.now() - new Date(myCall.answered_at!).getTime()) / 1000));
      }, 1000);
    } else {
      setCallTimer(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [myCall?.id, myCall?.status]);

  // Realtime subscription
  useEffect(() => {
    if (!workspace?.id) return;
    const channel = supabase
      .channel("telephony-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_calls" }, () => {
        qc.invalidateQueries({ queryKey: ["active-calls"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_telephony_state" }, () => {
        qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspace?.id, qc]);

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
    setAgentStatus,
    initiateCall,
    answerCall,
    toggleHold,
    endCall,
    transferCall,
    isLoading: agentStateQuery.isLoading,
  };
};
