import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface UnifiedConnection {
  id: string;
  user_id: string;
  workspace_id: string;
  business_id: string | null;
  provider: string;
  category: string;
  connection_type: "oauth" | "api_key" | "bot_token" | "webhook" | "credentials";
  status: "pending" | "connected" | "error" | "disconnected" | "expired";
  display_name: string | null;
  last_tested_at: string | null;
  last_error: string | null;
  config_json: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectionLog {
  id: string;
  connection_id: string | null;
  user_id: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

async function invokeIntegrationBoundary<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("manage-integration-connections", { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const useUnifiedConnections = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["unified-connections", workspace?.id],
    queryFn: async () => {
      const data = await invokeIntegrationBoundary<{ connections: UnifiedConnection[] }>({
        action: "list_unified",
        workspace_id: workspace!.id,
      });
      return data.connections ?? [];
    },
    enabled: !!user && !!workspace?.id,
  });

  const addConnection = useMutation({
    mutationFn: async (params: {
      provider: string;
      category: string;
      connection_type: string;
      display_name?: string;
      config_json?: Record<string, unknown>;
      business_id?: string;
    }) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await invokeIntegrationBoundary({
        action: "create_unified",
        workspace_id: workspace.id,
        provider: params.provider,
        category: params.category,
        connection_type: params.connection_type,
        display_name: params.display_name,
        config_json: params.config_json ?? {},
        business_id: params.business_id ?? null,
      });

      await supabase.from("connection_logs" as any).insert({
        user_id: user!.id,
        event_type: "connection_created",
        message: `Created ${params.connection_type} connection for ${params.provider}`,
        metadata: { provider: params.provider, category: params.category, workspace_id: workspace.id },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections", workspace?.id] });
      toast.success("Connection added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connection add failed"),
  });

  const testConnection = useMutation({
    mutationFn: async (id: string) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await invokeIntegrationBoundary({ action: "test_unified", workspace_id: workspace.id, id });

      await supabase.from("connection_logs" as any).insert({
        user_id: user!.id,
        connection_id: id,
        event_type: "connection_tested",
        message: "Connection test passed",
        metadata: { workspace_id: workspace.id },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections", workspace?.id] });
      toast.success("Connection test passed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connection test failed"),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, error: lastError }: { id: string; status: UnifiedConnection["status"]; error?: string }) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await invokeIntegrationBoundary({
        action: "update_unified_status",
        workspace_id: workspace.id,
        id,
        status,
        last_error: lastError ?? null,
      });

      await supabase.from("connection_logs" as any).insert({
        user_id: user!.id,
        connection_id: id,
        event_type: "status_changed",
        message: `Status changed to ${status}${lastError ? `: ${lastError}` : ""}`,
        metadata: { workspace_id: workspace.id },
      } as any);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unified-connections", workspace?.id] }),
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await supabase.from("connection_logs" as any).insert({
        user_id: user!.id,
        connection_id: id,
        event_type: "connection_deleted",
        message: "Connection removed",
        metadata: { workspace_id: workspace.id },
      } as any);

      await invokeIntegrationBoundary({ action: "delete_unified", workspace_id: workspace.id, id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections", workspace?.id] });
      toast.success("Connection removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connection removal failed"),
  });

  return {
    connections: query.data ?? [],
    isLoading: query.isLoading,
    addConnection,
    testConnection,
    updateStatus,
    deleteConnection,
  };
};

export const useConnectionLogs = (connectionId?: string | null) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["connection-logs", connectionId],
    queryFn: async () => {
      let q = supabase
        .from("connection_logs" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (connectionId) {
        q = q.eq("connection_id", connectionId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ConnectionLog[];
    },
    enabled: !!user,
  });
};
