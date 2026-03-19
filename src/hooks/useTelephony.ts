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

// ─── Twilio Client SDK Device (lazy-loaded) ─────────────────────

let twilioDevice: any = null;
let twilioConnection: any = null;
let deviceInitPromise: Promise<void> | null = null;

async function loadTwilioSdk(): Promise<any> {
  if ((window as any).Twilio?.Device) return (window as any).Twilio.Device;
  
  // Load Twilio Client JS SDK dynamically
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="twilio.min.js"]');
    if (existing) {
      // Wait for it to load
      const check = setInterval(() => {
        if ((window as any).Twilio?.Device) {
          clearInterval(check);
          resolve((window as any).Twilio.Device);
        }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error("Twilio SDK load timeout")); }, 10000);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.twilio.com/js/client/releases/1.14.0/twilio.min.js";
    script.onload = () => {
      const check = setInterval(() => {
        if ((window as any).Twilio?.Device) {
          clearInterval(check);
          resolve((window as any).Twilio.Device);
        }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error("Twilio SDK init timeout")); }, 5000);
    };
    script.onerror = () => reject(new Error("Failed to load Twilio Client SDK"));
    document.head.appendChild(script);
  });
}

export const useTelephony = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { createThreadForCall } = useCallInboxIntegration();

  // Check if business has a VoIP channel configured
  const voipConfigQuery = useQuery({
    queryKey: ["voip-config", workspace?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("channels")
        .select("id, settings")
        .eq("workspace_id", workspace!.id)
        .eq("channel_type", "voip")
        .eq("is_enabled", true)
        .maybeSingle();
      return data;
    },
    enabled: !!workspace,
  });

  const hasRealProvider = !!voipConfigQuery.data?.settings;
  const hasWebRtcCredentials = !!((voipConfigQuery.data?.settings as Record<string, string>)?.api_key_sid);

  // Initialize Twilio Device when provider is configured with WebRTC credentials
  useEffect(() => {
    if (!hasWebRtcCredentials || !workspace?.id || !user?.id) return;
    if (deviceInitPromise) return;

    deviceInitPromise = (async () => {
      try {
        const TwilioDevice = await loadTwilioSdk();

        // Fetch token from edge function
        const { data, error } = await supabase.functions.invoke("twilio-token", {
          body: { workspace_id: workspace.id },
        });
        if (error || data?.error) {
          console.warn("Twilio token error:", data?.error || error?.message);
          return;
        }

        twilioDevice = new TwilioDevice(data.token, {
          codecPreferences: ["opus", "pcmu"],
          enableRingingState: true,
        });

        twilioDevice.on("ready", () => {
          setDeviceReady(true);
          console.log("Twilio Device ready for WebRTC calls");
        });

        twilioDevice.on("incoming", (conn: any) => {
          // Incoming call via browser — auto-accept or show notification
          twilioConnection = conn;
          qc.invalidateQueries({ queryKey: ["active-calls"] });
          toast.info(`Incoming call from ${conn.parameters.From || "Unknown"}`);
        });

        twilioDevice.on("disconnect", () => {
          twilioConnection = null;
          qc.invalidateQueries({ queryKey: ["active-calls"] });
          qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
        });

        twilioDevice.on("error", (err: any) => {
          console.error("Twilio Device error:", err);
        });
      } catch (err) {
        console.warn("Twilio Client SDK not available:", err);
      }
    })();

    return () => {
      if (twilioDevice) {
        twilioDevice.destroy();
        twilioDevice = null;
        twilioConnection = null;
        deviceInitPromise = null;
        setDeviceReady(false);
      }
    };
  }, [hasWebRtcCredentials, workspace?.id, user?.id]);

  // Refresh Twilio token every 50 minutes
  useEffect(() => {
    if (!deviceReady || !workspace?.id) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("twilio-token", {
          body: { workspace_id: workspace.id },
        });
        if (data?.token && twilioDevice) {
          twilioDevice.updateToken(data.token);
        }
      } catch { /* ignore */ }
    }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [deviceReady, workspace?.id]);

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

  // Helper to call the telephony edge function
  const callTelephonyApi = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("telephony-call-manager", {
      body: { action, workspace_id: workspace!.id, ...extra },
    });
    if (error) throw new Error(error.message || "Telephony API error");
    if (data?.error) throw new Error(data.error);
    return data;
  };

  // Initiate outbound call
  const initiateCall = useMutation({
    mutationFn: async (params: { number: string; contactName?: string; dealId?: string }) => {
      if (hasRealProvider) {
        // If WebRTC device is ready, make call via browser
        if (deviceReady && twilioDevice) {
          const result = await callTelephonyApi("make_call", {
            number: params.number,
            contact_name: params.contactName,
            deal_id: params.dealId,
          });

          // The Twilio Device will handle the audio via the TwiML App
          // Connect browser audio to the call
          try {
            twilioConnection = twilioDevice.connect({
              To: params.number,
            });
          } catch (e) {
            console.warn("Browser audio connect failed, call continues server-side:", e);
          }

          return result.call as ActiveCall;
        }

        // Server-side only call (no browser audio)
        const result = await callTelephonyApi("make_call", {
          number: params.number,
          contact_name: params.contactName,
          deal_id: params.dealId,
        });
        return result.call as ActiveCall;
      }

      // Fallback: DB-only simulation
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
    onSuccess: (call) => {
      qc.invalidateQueries({ queryKey: ["active-calls"] });
      qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
      qc.invalidateQueries({ queryKey: ["call-records"] });
      if (call?.call_record_id) {
        createThreadForCall.mutate({
          callRecordId: call.call_record_id,
          contactPhone: call.callee_number || call.caller_number,
          contactName: call.caller_name || undefined,
          direction: "outbound",
        });
      }
      toast.success(
        deviceReady ? "Call initiated (WebRTC)" :
        hasRealProvider ? "Call initiated via Twilio" :
        "Call initiated (simulation)"
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Answer call — handle both WebRTC and DB state
  const answerCall = useMutation({
    mutationFn: async (callId: string) => {
      // Accept incoming Twilio Client connection
      if (twilioConnection && typeof twilioConnection.accept === "function") {
        twilioConnection.accept();
      }

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
    onSuccess: (_, callId) => {
      qc.invalidateQueries({ queryKey: ["active-calls"] });
      qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
      const call = activeCallsQuery.data?.find((c) => c.id === callId);
      if (call?.call_record_id) {
        createThreadForCall.mutate({
          callRecordId: call.call_record_id,
          contactPhone: call.caller_number,
          contactName: call.caller_name || undefined,
          direction: "inbound",
        });
      }
    },
  });

  // Hold/unhold — real audio + API
  const toggleHold = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCallsQuery.data?.find((c) => c.id === callId);
      if (!call) throw new Error("Call not found");

      if (hasRealProvider && call.sip_call_id) {
        if (call.status === "on_hold") {
          await callTelephonyApi("resume_call", { call_id: callId });
          // Unmute local audio on resume
          if (twilioConnection) {
            twilioConnection.mute(false);
          }
        } else {
          await callTelephonyApi("hold_call", { call_id: callId });
          // Mute local audio on hold
          if (twilioConnection) {
            twilioConnection.mute(true);
          }
        }
        return;
      }

      // DB-only fallback
      if (call.status === "on_hold") {
        const holdDuration = call.hold_started_at
          ? Math.floor((Date.now() - new Date(call.hold_started_at).getTime()) / 1000)
          : 0;
        await supabase
          .from("active_calls")
          .update({
            status: "in_progress",
            hold_started_at: null,
            total_hold_seconds: (call.total_hold_seconds || 0) + holdDuration,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", callId);
      } else {
        await supabase
          .from("active_calls")
          .update({
            status: "on_hold",
            hold_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", callId);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-calls"] }),
  });

  // End call — disconnect WebRTC + API
  const endCall = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCallsQuery.data?.find((c) => c.id === callId);

      // Disconnect browser audio
      if (twilioConnection) {
        try { twilioConnection.disconnect(); } catch { /* ignore */ }
        twilioConnection = null;
      }

      if (hasRealProvider && call?.sip_call_id) {
        await callTelephonyApi("end_call", { call_id: callId });
        return;
      }

      // DB-only fallback
      const now = new Date().toISOString();
      await supabase
        .from("active_calls")
        .update({ status: "completed", ended_at: now, updated_at: now } as any)
        .eq("id", callId);

      if (call?.call_record_id) {
        const duration = call.answered_at
          ? Math.floor((Date.now() - new Date(call.answered_at).getTime()) / 1000)
          : 0;
        await supabase
          .from("call_records")
          .update({ call_status: "completed", call_duration: duration, updated_at: now } as any)
          .eq("id", call.call_record_id);
      }

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
      setIsMuted(false);
      toast.info("Call ended");
    },
  });

  // Transfer call
  const transferCall = useMutation({
    mutationFn: async ({ callId, targetNumber }: { callId: string; targetNumber: string }) => {
      if (hasRealProvider) {
        await callTelephonyApi("transfer_call", { call_id: callId, target_number: targetNumber });
        if (twilioConnection) {
          try { twilioConnection.disconnect(); } catch { /* ignore */ }
          twilioConnection = null;
        }
        return;
      }

      await supabase
        .from("active_calls")
        .update({
          status: "transferring",
          transfer_target: targetNumber,
          transferred_from: user!.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", callId);

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
      setIsMuted(false);
      toast.success("Call transferred");
    },
  });

  // Real mute — toggles Twilio Connection audio track
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (twilioConnection && typeof twilioConnection.mute === "function") {
        twilioConnection.mute(next);
      }
      return next;
    });
  }, []);

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
