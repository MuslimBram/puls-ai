/**
 * Telephony query hooks — agent state, active calls, call queues, realtime.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { ActiveCall, AgentTelephonyState, CallQueue, TelephonyStatus } from "./types";

const STALE_OFFLINE_MS = 5 * 60 * 1000;
const VALID_TELEPHONY_STATUSES = new Set<TelephonyStatus>([
  "online",
  "busy",
  "on_call",
  "wrap_up",
  "offline",
  "dnd",
]);

export function useAgentState() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["agent-telephony-state", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_telephony_state").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      if (data) {
        const state = data as AgentTelephonyState;
        const status = state.telephony_status as TelephonyStatus;

        if (!VALID_TELEPHONY_STATUSES.has(status)) {
          return { ...state, telephony_status: "online" } as AgentTelephonyState;
        }

        // Recover stale offline status on new app sessions
        if (status === "offline") {
          const updatedAt = new Date(state.updated_at).getTime();
          const isStaleOffline = Number.isFinite(updatedAt) && (Date.now() - updatedAt > STALE_OFFLINE_MS);

          if (isStaleOffline) {
            const { data: updated, error: updateError } = await supabase
              .from("agent_telephony_state")
              .update({ telephony_status: "online", updated_at: new Date().toISOString() })
              .eq("id", state.id)
              .eq("user_id", user!.id)
              .select("*")
              .maybeSingle();

            if (!updateError && updated) return updated as AgentTelephonyState;
          }
        }

        return state;
      }

      // Auto-create with "online" status when user is logged in
      if (workspace?.id) {
        const { data: created, error: createErr } = await supabase
          .from("agent_telephony_state")
          .upsert({
            user_id: user!.id,
            workspace_id: workspace.id,
            telephony_status: "online",
          }, { onConflict: "user_id" })
          .select()
          .single();
        if (!createErr && created) return created as AgentTelephonyState;
      }
      return { telephony_status: "online" } as AgentTelephonyState;
    },
    enabled: !!user,
  });
}

export function useActiveCalls() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["active-calls", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_calls").select("*").eq("workspace_id", workspace!.id)
        .in("status", ["ringing", "queued", "in_progress", "on_hold", "transferring"])
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ActiveCall[];
    },
    enabled: !!workspace,
    refetchInterval: 5000,
  });
}

export function useCallQueues() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["call-queues", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_queues").select("*").eq("workspace_id", workspace!.id)
        .eq("is_active", true).order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CallQueue[];
    },
    enabled: !!workspace,
  });
}

export function useTelephonyRealtime() {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

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
}
