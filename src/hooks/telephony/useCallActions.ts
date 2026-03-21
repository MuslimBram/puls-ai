/**
 * Call action mutations — initiate, answer, hold, end, transfer, mute.
 */
import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";
import { useCallInboxIntegration } from "../useCallInboxIntegration";
import { getTwilioConnection, setTwilioConnection } from "./useTwilioDevice";
import type { ActiveCall, AgentTelephonyState, TelephonyStatus } from "./types";

async function callTelephonyApi(workspaceId: string, action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("telephony-call-manager", {
    body: { action, workspace_id: workspaceId, ...extra },
  });
  if (error) throw new Error(error.message || "Telephony API error");
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useCallActions(
  activeCalls: ActiveCall[],
  agentState: AgentTelephonyState | null | undefined,
  hasRealProvider: boolean,
  deviceReady: boolean,
  twilioDevice: any,
  setIsMuted: (fn: (prev: boolean) => boolean) => void,
) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const { createThreadForCall } = useCallInboxIntegration();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["active-calls"] });
    qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
    qc.invalidateQueries({ queryKey: ["call-records"] });
  };

  const setAgentStatus = useMutation({
    mutationFn: async (status: TelephonyStatus) => {
      const { error } = await supabase.from("agent_telephony_state").upsert({
        user_id: user!.id, workspace_id: workspace!.id, telephony_status: status, updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-telephony-state"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const initiateCall = useMutation({
    mutationFn: async (params: { number: string; contactName?: string; dealId?: string }) => {
      if (hasRealProvider) {
        const result = await callTelephonyApi(workspace!.id, "make_call", {
          number: params.number, contact_name: params.contactName, deal_id: params.dealId,
        });
        if (deviceReady && twilioDevice) {
          try { setTwilioConnection(twilioDevice.connect({ To: params.number })); } catch (e) {
            console.warn("Browser audio connect failed:", e);
          }
        }
        return result.call as ActiveCall;
      }

      // DB-only simulation
      const { data: call, error } = await supabase.from("active_calls").insert({
        workspace_id: workspace!.id, agent_user_id: user!.id, caller_number: "softphone",
        callee_number: params.number, caller_name: params.contactName || null,
        direction: "outbound", status: "ringing",
        metadata: params.dealId ? { deal_id: params.dealId } : {},
      } as any).select().single();
      if (error) throw error;

      const { data: record } = await supabase.from("call_records").insert({
        user_id: user!.id, workspace_id: workspace!.id, contact_phone: params.number,
        contact_name: params.contactName || null, deal_id: params.dealId || null,
        call_direction: "outbound", call_status: "ringing", channel_provider: "softphone",
      } as any).select().single();

      if (record) await supabase.from("active_calls").update({ call_record_id: record.id } as any).eq("id", (call as any).id);

      await supabase.from("agent_telephony_state").upsert({
        user_id: user!.id, workspace_id: workspace!.id, telephony_status: "on_call",
        current_call_id: (call as any).id, updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });

      return call as unknown as ActiveCall;
    },
    onSuccess: (call) => {
      invalidateAll();
      if (call?.call_record_id) {
        createThreadForCall.mutate({
          callRecordId: call.call_record_id, contactPhone: call.callee_number || call.caller_number,
          contactName: call.caller_name || undefined, direction: "outbound",
        });
      }
      toast.success(deviceReady ? "Call initiated (WebRTC)" : hasRealProvider ? "Call initiated via Twilio" : "Call initiated (simulation)");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const answerCall = useMutation({
    mutationFn: async (callId: string) => {
      const conn = getTwilioConnection();
      if (conn && typeof conn.accept === "function") conn.accept();
      const { error } = await supabase.from("active_calls").update({
        status: "in_progress", agent_user_id: user!.id,
        answered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      } as any).eq("id", callId);
      if (error) throw error;
      await supabase.from("agent_telephony_state").upsert({
        user_id: user!.id, workspace_id: workspace!.id, telephony_status: "on_call",
        current_call_id: callId, updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
    },
    onSuccess: (_, callId) => {
      invalidateAll();
      const call = activeCalls.find((c) => c.id === callId);
      if (call?.call_record_id) {
        createThreadForCall.mutate({
          callRecordId: call.call_record_id, contactPhone: call.caller_number,
          contactName: call.caller_name || undefined, direction: "inbound",
        });
      }
    },
  });

  const toggleHold = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCalls.find((c) => c.id === callId);
      if (!call) throw new Error("Call not found");
      const conn = getTwilioConnection();

      if (hasRealProvider && call.sip_call_id) {
        if (call.status === "on_hold") {
          await callTelephonyApi(workspace!.id, "resume_call", { call_id: callId });
          if (conn) conn.mute(false);
        } else {
          await callTelephonyApi(workspace!.id, "hold_call", { call_id: callId });
          if (conn) conn.mute(true);
        }
        return;
      }

      if (call.status === "on_hold") {
        const holdDuration = call.hold_started_at ? Math.floor((Date.now() - new Date(call.hold_started_at).getTime()) / 1000) : 0;
        await supabase.from("active_calls").update({
          status: "in_progress", hold_started_at: null,
          total_hold_seconds: (call.total_hold_seconds || 0) + holdDuration, updated_at: new Date().toISOString(),
        } as any).eq("id", callId);
      } else {
        await supabase.from("active_calls").update({
          status: "on_hold", hold_started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as any).eq("id", callId);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-calls"] }),
  });

  const endCall = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCalls.find((c) => c.id === callId);
      const conn = getTwilioConnection();
      if (conn) { try { conn.disconnect(); } catch { /* ignore */ } setTwilioConnection(null); }

      if (hasRealProvider && call?.sip_call_id) {
        await callTelephonyApi(workspace!.id, "end_call", { call_id: callId });
        return;
      }

      const now = new Date().toISOString();
      await supabase.from("active_calls").update({ status: "completed", ended_at: now, updated_at: now } as any).eq("id", callId);

      if (call?.call_record_id) {
        const duration = call.answered_at ? Math.floor((Date.now() - new Date(call.answered_at).getTime()) / 1000) : 0;
        await supabase.from("call_records").update({ call_status: "completed", call_duration: duration, updated_at: now } as any).eq("id", call.call_record_id);
      }

      await supabase.from("agent_telephony_state").upsert({
        user_id: user!.id, workspace_id: workspace!.id, telephony_status: "wrap_up",
        current_call_id: null, last_call_ended_at: now,
        calls_handled_today: (agentState?.calls_handled_today ?? 0) + 1, updated_at: now,
      } as any, { onConflict: "user_id" });
    },
    onSuccess: () => { invalidateAll(); setIsMuted(() => false); toast.info("Call ended"); },
  });

  const transferCall = useMutation({
    mutationFn: async ({ callId, targetNumber }: { callId: string; targetNumber: string }) => {
      if (hasRealProvider) {
        await callTelephonyApi(workspace!.id, "transfer_call", { call_id: callId, target_number: targetNumber });
        const conn = getTwilioConnection();
        if (conn) { try { conn.disconnect(); } catch { /* ignore */ } setTwilioConnection(null); }
        return;
      }
      await supabase.from("active_calls").update({
        status: "transferring", transfer_target: targetNumber, transferred_from: user!.id, updated_at: new Date().toISOString(),
      } as any).eq("id", callId);
      await supabase.from("agent_telephony_state").upsert({
        user_id: user!.id, workspace_id: workspace!.id, telephony_status: "online",
        current_call_id: null, updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
    },
    onSuccess: () => { invalidateAll(); setIsMuted(() => false); toast.success("Call transferred"); },
  });

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      const conn = getTwilioConnection();
      if (conn && typeof conn.mute === "function") conn.mute(next);
      return next;
    });
  }, []);

  return { setAgentStatus, initiateCall, answerCall, toggleHold, endCall, transferCall, toggleMute };
}
