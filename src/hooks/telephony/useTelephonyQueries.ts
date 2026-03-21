/**
 * Telephony query hooks — agent state, active calls, call queues, realtime.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { ActiveCall, AgentTelephonyState, CallQueue } from "./types";

export function useAgentState() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["agent-telephony-state", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_telephony_state").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      if (data) return data as AgentTelephonyState;

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
