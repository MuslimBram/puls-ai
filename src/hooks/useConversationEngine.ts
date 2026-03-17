import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { useEffect, useCallback, useRef } from "react";

// ── State Machine ──
export const THREAD_STATES = [
  { value: "new", label: "New", color: "bg-blue-500/10 text-blue-700" },
  { value: "open", label: "Open", color: "bg-emerald-500/10 text-emerald-700" },
  { value: "pending", label: "Pending", color: "bg-yellow-500/10 text-yellow-700" },
  { value: "resolved", label: "Resolved", color: "bg-green-500/10 text-green-700" },
  { value: "closed", label: "Closed", color: "bg-muted text-muted-foreground" },
] as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["open", "pending", "resolved", "closed"],
  open: ["pending", "resolved", "closed"],
  pending: ["open", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

export const canTransition = (from: string, to: string) =>
  VALID_TRANSITIONS[from]?.includes(to) ?? false;

// ── SLA Config ──
export interface SLAConfig {
  id: string;
  workspace_id: string;
  first_response_minutes: number;
  next_response_minutes: number;
  resolution_minutes: number;
  business_hours_only: boolean;
  business_start_hour: number;
  business_end_hour: number;
  is_active: boolean;
}

export const useSLAConfig = (workspaceId: string | null) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["sla-config", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_configs")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as SLAConfig | null;
    },
    enabled: !!user && !!workspaceId,
  });

  const upsert = useMutation({
    mutationFn: async (config: Partial<SLAConfig>) => {
      const { error } = await supabase
        .from("sla_configs")
        .upsert({ ...config, workspace_id: workspaceId! } as any, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sla-config"] });
      toast.success("SLA config saved");
    },
    onError: (e) => toast.error(e.message),
  });

  return { config: query.data, isLoading: query.isLoading, upsert };
};

// ── Thread State Transition ──
export const useThreadStateMachine = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId, newStatus }: { threadId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("conversation_threads")
        .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
        .eq("id", threadId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation-threads"] });
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });
};

// ── Conversation Locks (Collision Detection) ──
export const useConversationLock = (threadId: string | null) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const query = useQuery({
    queryKey: ["conversation-lock", threadId],
    queryFn: async () => {
      // Clean expired first
      await supabase.from("conversation_locks").delete().lt("expires_at", new Date().toISOString());

      const { data, error } = await supabase
        .from("conversation_locks")
        .select("*")
        .eq("thread_id", threadId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!threadId && !!user,
    refetchInterval: 10000,
  });

  const acquireLock = useMutation({
    mutationFn: async (lockType: "typing" | "replying" = "typing") => {
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("conversation_locks")
        .upsert({
          thread_id: threadId!,
          locked_by: user!.id,
          locked_at: new Date().toISOString(),
          expires_at: expiresAt,
          lock_type: lockType,
        } as any, { onConflict: "thread_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation-lock", threadId] }),
  });

  const releaseLock = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("conversation_locks")
        .delete()
        .eq("thread_id", threadId!)
        .eq("locked_by", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation-lock", threadId] }),
  });

  // Auto-renew lock while active
  const startLock = useCallback(
    (lockType: "typing" | "replying" = "typing") => {
      acquireLock.mutate(lockType);
      intervalRef.current = setInterval(() => acquireLock.mutate(lockType), 90000);
    },
    [acquireLock]
  );

  const stopLock = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    releaseLock.mutate();
  }, [releaseLock]);

  const lock = query.data;
  const isLockedByOther = lock && lock.locked_by !== user?.id;

  return { lock, isLockedByOther, startLock, stopLock, acquireLock, releaseLock };
};

// ── Team Presence ──
export const useTeamPresence = (workspaceId: string | null) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["team-presence", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_presence")
        .select("*")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!workspaceId,
    refetchInterval: 30000,
  });

  const updatePresence = useMutation({
    mutationFn: async (status: "online" | "offline" | "idle" | "busy") => {
      const { error } = await supabase
        .from("team_presence")
        .upsert(
          {
            user_id: user!.id,
            workspace_id: workspaceId!,
            status,
            last_active_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-presence"] }),
  });

  // Auto-heartbeat with idle detection via Page Visibility API
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!user || !workspaceId) return;

    const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

    const trackActivity = () => { lastActivityRef.current = Date.now(); };

    const sendHeartbeat = () => {
      const isHidden = document.visibilityState === "hidden";
      const isIdle = Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS;

      if (isHidden || isIdle) {
        updatePresence.mutate("idle");
      } else {
        updatePresence.mutate("online");
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        lastActivityRef.current = Date.now();
        updatePresence.mutate("online");
      } else {
        updatePresence.mutate("idle");
      }
    };

    // Initial presence
    updatePresence.mutate("online");

    // Listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("mousemove", trackActivity, { passive: true });
    window.addEventListener("keydown", trackActivity, { passive: true });
    window.addEventListener("click", trackActivity, { passive: true });
    window.addEventListener("scroll", trackActivity, { passive: true });

    const interval = setInterval(sendHeartbeat, 60000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mousemove", trackActivity);
      window.removeEventListener("keydown", trackActivity);
      window.removeEventListener("click", trackActivity);
      window.removeEventListener("scroll", trackActivity);
      supabase
        .from("team_presence")
        .update({ status: "offline", updated_at: new Date().toISOString() } as any)
        .eq("user_id", user.id)
        .then();
    };
  }, [user?.id, workspaceId]);

  // Realtime subscription
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel("presence-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "team_presence" }, () =>
        qc.invalidateQueries({ queryKey: ["team-presence"] })
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [workspaceId]);

  return { members: query.data ?? [], isLoading: query.isLoading, updatePresence };
};

// ── Assignment Routing ──
export const useAssignmentRules = (workspaceId: string | null) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["assignment-rules", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_rules")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!workspaceId,
  });

  const upsert = useMutation({
    mutationFn: async (rules: Record<string, unknown>) => {
      const { error } = await supabase
        .from("assignment_rules")
        .upsert({ ...rules, workspace_id: workspaceId! } as any, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignment-rules"] });
      toast.success("Assignment rules saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const assignThread = useMutation({
    mutationFn: async ({ threadId, agentId }: { threadId: string; agentId: string | null }) => {
      const { error } = await supabase
        .from("conversation_threads")
        .update({ assigned_to: agentId, updated_at: new Date().toISOString() } as any)
        .eq("id", threadId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation-threads"] });
      toast.success("Agent assigned");
    },
    onError: (e) => toast.error(e.message),
  });

  const autoAssign = useMutation({
    mutationFn: async (threadId: string) => {
      const { data, error } = await supabase.rpc("assign_thread_round_robin", {
        _workspace_id: workspaceId!,
        _thread_id: threadId,
      });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (agentId) => {
      qc.invalidateQueries({ queryKey: ["conversation-threads"] });
      if (agentId) toast.success("Auto-assigned to agent");
      else toast.info("No available agents for assignment");
    },
    onError: (e) => toast.error(e.message),
  });

  return { rules: query.data, isLoading: query.isLoading, upsert, assignThread, autoAssign };
};

// ── Workload Metrics ──
export const useAgentWorkload = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["agent-workload", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_threads")
        .select("assigned_to, status, sla_breached, first_response_at, created_at")
        .eq("user_id", user!.id);
      if (error) throw error;

      const threads = data ?? [];
      const byAgent: Record<string, {
        agent_id: string;
        open: number;
        resolved: number;
        breached: number;
        avgResponseMin: number;
      }> = {};

      for (const t of threads) {
        const aid = (t as any).assigned_to || "unassigned";
        if (!byAgent[aid]) byAgent[aid] = { agent_id: aid, open: 0, resolved: 0, breached: 0, avgResponseMin: 0 };
        if (["new", "open", "pending"].includes(t.status)) byAgent[aid].open++;
        if (t.status === "resolved") byAgent[aid].resolved++;
        if ((t as any).sla_breached && !["resolved", "closed"].includes(t.status)) byAgent[aid].breached++;
      }

      const unassignedQueue = threads.filter((t) => t.status === "new" && !(t as any).assigned_to).length;
      const totalOpen = threads.filter((t) => ["new", "open", "pending"].includes(t.status)).length;

      return { byAgent: Object.values(byAgent), unassignedQueue, totalOpen };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
};

// ── Escalation Rules ──
export interface EscalationRule {
  id: string;
  workspace_id: string;
  name: string;
  trigger_type: string;
  trigger_minutes: number;
  action_type: string;
  escalate_to_user_id: string | null;
  notify_channel: string;
  is_active: boolean;
  priority: number;
}

export const useEscalationRules = (workspaceId?: string) => {
  return useQuery({
    queryKey: ["escalation-rules", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalation_rules")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as EscalationRule[];
    },
    enabled: !!workspaceId,
  });
};

export const useUpsertEscalationRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<EscalationRule> & { workspace_id: string }) => {
      const { error } = await supabase
        .from("escalation_rules")
        .upsert(rule as any, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation-rules"] });
      toast.success("Escalation rule saved");
    },
    onError: (e) => toast.error(e.message),
  });
};

export const useDeleteEscalationRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from("escalation_rules")
        .delete()
        .eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation-rules"] });
      toast.success("Escalation rule deleted");
    },
    onError: (e) => toast.error(e.message),
  });
};

// ── Escalation Log ──
export const useEscalationLog = (workspaceId?: string) => {
  return useQuery({
    queryKey: ["escalation-log", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalation_log")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId,
  });
};
