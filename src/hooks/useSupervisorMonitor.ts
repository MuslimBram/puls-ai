import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";
import { useEffect } from "react";

export interface SupervisorSession {
  id: string;
  workspace_id: string;
  supervisor_user_id: string;
  agent_user_id: string;
  active_call_id: string | null;
  mode: "listen" | "whisper" | "barge";
  started_at: string;
  ended_at: string | null;
  notes: string | null;
}

export interface AgentLiveStatus {
  user_id: string;
  telephony_status: string;
  current_call_id: string | null;
  calls_handled_today: number;
  sip_extension: string | null;
}

export const useSupervisorMonitor = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  // All agent states
  const agentsQuery = useQuery({
    queryKey: ["agent-states-all", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_telephony_state")
        .select("*")
        .eq("workspace_id", workspace!.id);
      if (error) throw error;
      return (data ?? []) as unknown as AgentLiveStatus[];
    },
    enabled: !!workspace,
    refetchInterval: 3000,
  });

  // Active supervisor sessions
  const sessionsQuery = useQuery({
    queryKey: ["supervisor-sessions", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supervisor_sessions")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .eq("supervisor_user_id", user!.id)
        .is("ended_at", null);
      if (error) throw error;
      return (data ?? []) as unknown as SupervisorSession[];
    },
    enabled: !!user && !!workspace,
  });

  // Start monitoring
  const startMonitoring = useMutation({
    mutationFn: async (params: { agentUserId: string; activeCallId?: string; mode?: "listen" | "whisper" | "barge" }) => {
      const { data, error } = await supabase
        .from("supervisor_sessions")
        .insert({
          workspace_id: workspace!.id,
          supervisor_user_id: user!.id,
          agent_user_id: params.agentUserId,
          active_call_id: params.activeCallId || null,
          mode: params.mode || "listen",
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as SupervisorSession;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["supervisor-sessions"] });
      toast.info(`Monitoring agent (${vars.mode || "listen"} mode)`);
    },
  });

  // Change mode
  const changeMode = useMutation({
    mutationFn: async ({ sessionId, mode }: { sessionId: string; mode: "listen" | "whisper" | "barge" }) => {
      const { error } = await supabase
        .from("supervisor_sessions")
        .update({ mode } as any)
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supervisor-sessions"] }),
  });

  // Stop monitoring
  const stopMonitoring = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("supervisor_sessions")
        .update({ ended_at: new Date().toISOString() } as any)
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supervisor-sessions"] });
      toast.info("Monitoring ended");
    },
  });

  // Realtime
  useEffect(() => {
    if (!workspace?.id) return;
    const channel = supabase
      .channel("supervisor-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_telephony_state" }, () => {
        qc.invalidateQueries({ queryKey: ["agent-states-all"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "supervisor_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["supervisor-sessions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspace?.id, qc]);

  return {
    agents: agentsQuery.data ?? [],
    sessions: sessionsQuery.data ?? [],
    startMonitoring,
    changeMode,
    stopMonitoring,
    isLoading: agentsQuery.isLoading,
  };
};
