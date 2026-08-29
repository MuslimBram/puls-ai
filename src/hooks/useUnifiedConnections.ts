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
      credentials?: Record<string, string>;
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
        credentials: params.credentials,
        business_id: params.business_id ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections", workspace?.id] });
      qc.invalidateQueries({ queryKey: ["connection-logs", workspace?.id] });
      toast.success("Connection added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connection add failed"),
  });

  const testConnection = useMutation({
    mutationFn: async (id: string) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await invokeIntegrationBoundary({ action: "test_unified", workspace_id: workspace.id, id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections", workspace?.id] });
      qc.invalidateQueries({ queryKey: ["connection-logs", workspace?.id] });
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections", workspace?.id] });
      qc.invalidateQueries({ queryKey: ["connection-logs", workspace?.id] });
    },
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await invokeIntegrationBoundary({ action: "delete_unified", workspace_id: workspace.id, id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections", workspace?.id] });
      qc.invalidateQueries({ queryKey: ["connection-logs", workspace?.id] });
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
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey: ["connection-logs", workspace?.id, connectionId],
    queryFn: async () => {
      const data = await invokeIntegrationBoundary<{ logs: ConnectionLog[] }>({
        action: "list_connection_logs",
        workspace_id: workspace!.id,
        connection_id: connectionId ?? null,
      });
      return data.logs ?? [];
    },
    enabled: !!user && !!workspace?.id,
  });
};
