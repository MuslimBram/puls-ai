import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface ExternalIntegration {
  id: string;
  user_id: string;
  workspace_id: string;
  integration_key: string;
  integration_name: string;
  category: string;
  description: string | null;
  status: string;
  is_enabled: boolean;
  credentials: Record<string, string>;
  has_credentials: boolean;
  config: Record<string, unknown>;
  usage_count: number;
  last_used_at: string | null;
  rate_limit_per_hour: number;
  min_scan_interval_minutes: number;
  last_scan_at: string | null;
  keyword_match_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface IntegrationEventLog {
  id: string;
  integration_id: string;
  event_type: string;
  event_message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

async function invokeIntegrationBoundary<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("manage-integration-connections", { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const useExternalIntegrations = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["external-integrations", workspace?.id],
    queryFn: async () => {
      const data = await invokeIntegrationBoundary<{ integrations: ExternalIntegration[] }>({
        action: "list_external",
        workspace_id: workspace!.id,
      });
      return data.integrations ?? [];
    },
    enabled: !!user && !!workspace?.id,
  });

  const upsertIntegration = useMutation({
    mutationFn: async (params: {
      integration_key: string;
      integration_name: string;
      category: string;
      description?: string;
      credentials?: Record<string, string>;
      config?: Record<string, unknown>;
      status?: string;
      is_enabled?: boolean;
      rate_limit_per_hour?: number;
      min_scan_interval_minutes?: number;
      keyword_match_threshold?: number;
    }) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await invokeIntegrationBoundary({
        action: "upsert_external",
        workspace_id: workspace.id,
        ...params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-integrations", workspace?.id] });
      toast.success("Integration saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Integration save failed"),
  });

  const toggleIntegration = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await invokeIntegrationBoundary({
        action: "toggle_external",
        workspace_id: workspace.id,
        id,
        is_enabled,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["external-integrations", workspace?.id] }),
  });

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => {
      if (!workspace?.id) throw new Error("Select a workspace first");
      await invokeIntegrationBoundary({ action: "delete_external", workspace_id: workspace.id, id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-integrations", workspace?.id] });
      toast.success("Integration removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Integration removal failed"),
  });

  return {
    integrations: query.data ?? [],
    isLoading: query.isLoading,
    upsertIntegration,
    toggleIntegration,
    deleteIntegration,
  };
};

export const useIntegrationEventLogs = (integrationId: string | null) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey: ["integration-event-logs", workspace?.id, integrationId],
    queryFn: async () => {
      const data = await invokeIntegrationBoundary<{ logs: IntegrationEventLog[] }>({
        action: "list_integration_logs",
        workspace_id: workspace!.id,
        integration_id: integrationId!,
      });
      return data.logs ?? [];
    },
    enabled: !!user && !!workspace?.id && !!integrationId,
  });
};
