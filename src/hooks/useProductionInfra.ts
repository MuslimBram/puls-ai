import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

// ── Job Queue ──
export const useJobQueue = (statusFilter?: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["job-queue", user?.id, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("job_queue")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (statusFilter) q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });
};

export const useEnqueueJob = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (job: { job_type: string; payload: Record<string, unknown>; priority?: number }) => {
      const { error } = await supabase.from("job_queue").insert({
        ...job,
        user_id: user!.id,
        workspace_id: workspace?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-queue"] });
      toast.success("Job enqueued");
    },
    onError: (e) => toast.error(e.message),
  });
};

// ── Health Monitoring ──
export const useHealthChecks = () => {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["health-checks", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_health_checks")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("checked_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspace,
    refetchInterval: 60000,
  });
};

export const useApiErrors = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["api-errors", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_error_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });
};

// ── Subscription Cache ──
export const useSubscriptionCache = () => {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["sub-cache", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_state_cache")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });
};

// ── Storage Quotas ──
export const useStorageQuota = () => {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["storage-quota", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_storage_quotas")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });
};

export const useCheckQuota = () => {
  const { workspace } = useWorkspace();
  return useCallback(
    async (resourceType: "messages" | "documents" | "media"): Promise<boolean> => {
      if (!workspace?.id) return true;
      const { data, error } = await supabase.rpc("check_storage_quota", {
        _workspace_id: workspace.id,
        _resource_type: resourceType,
      });
      if (error) { console.error("Quota check error:", error); return true; }
      return data as boolean;
    },
    [workspace?.id]
  );
};

// ── Security Events ──
export const useSecurityEvents = (limit: number = 50) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["security-events", user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_events")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });
};

export const useLogSecurityEvent = () => {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (event: { event_type: string; ip_address?: string; metadata?: Record<string, unknown> }) => {
      const { error } = await supabase.from("security_events").insert({
        event_type: event.event_type,
        ip_address: event.ip_address ?? null,
        metadata: event.metadata ?? {},
        user_id: user!.id,
      } as any);
      if (error) throw error;
    },
  });
};

// ── Rate Limit Status ──
export const useRateLimitStatus = () => {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["rate-limits", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_limit_buckets")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspace,
  });
};

// ── Data Export ──
export const useWorkspaceExport = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useMutation({
    mutationFn: async () => {
      const [leads, messages, threads] = await Promise.all([
        supabase.from("leads").select("*").eq("user_id", user!.id),
        supabase.from("inbox_messages").select("*").eq("user_id", user!.id).limit(1000),
        supabase.from("conversation_threads").select("*").eq("user_id", user!.id),
      ]);

      return {
        exported_at: new Date().toISOString(),
        workspace: workspace?.name,
        leads: leads.data ?? [],
        messages: messages.data ?? [],
        threads: threads.data ?? [],
      };
    },
    onSuccess: (data) => {
      // Download as JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workspace-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Workspace data exported");
    },
    onError: (e) => toast.error(e.message),
  });
};
