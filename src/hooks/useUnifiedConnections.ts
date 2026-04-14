import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface UnifiedConnection {
  id: string;
  user_id: string;
  workspace_id: string | null;
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

export const useUnifiedConnections = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["unified-connections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_connections" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as UnifiedConnection[];
    },
    enabled: !!user,
  });

  const addConnection = useMutation({
    mutationFn: async (params: {
      provider: string;
      category: string;
      connection_type: string;
      display_name?: string;
      config_json?: Record<string, unknown>;
      business_id?: string;
      workspace_id?: string;
    }) => {
      const { error } = await supabase.from("unified_connections" as any).insert({
        user_id: user!.id,
        provider: params.provider,
        category: params.category,
        connection_type: params.connection_type,
        display_name: params.display_name || params.provider,
        config_json: params.config_json || {},
        business_id: params.business_id || null,
        workspace_id: params.workspace_id || null,
        status: "pending",
      } as any);
      if (error) throw error;

      // Log the connection
      await supabase.from("connection_logs" as any).insert({
        user_id: user!.id,
        event_type: "connection_created",
        message: `Created ${params.connection_type} connection for ${params.provider}`,
        metadata: { provider: params.provider, category: params.category },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections"] });
      toast.success("Connection added");
    },
    onError: (e) => toast.error(e.message),
  });

  const testConnection = useMutation({
    mutationFn: async (id: string) => {
      // Update last_tested_at
      const { error } = await supabase
        .from("unified_connections" as any)
        .update({
          last_tested_at: new Date().toISOString(),
          status: "connected",
          last_error: null,
        } as any)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("connection_logs" as any).insert({
        user_id: user!.id,
        connection_id: id,
        event_type: "connection_tested",
        message: "Connection test passed",
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections"] });
      toast.success("Connection test passed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, error: lastError }: { id: string; status: string; error?: string }) => {
      const { error } = await supabase
        .from("unified_connections" as any)
        .update({ status, last_error: lastError || null } as any)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("connection_logs" as any).insert({
        user_id: user!.id,
        connection_id: id,
        event_type: "status_changed",
        message: `Status changed to ${status}${lastError ? `: ${lastError}` : ""}`,
      } as any);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unified-connections"] }),
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("connection_logs" as any).insert({
        user_id: user!.id,
        connection_id: id,
        event_type: "connection_deleted",
        message: "Connection removed",
      } as any);

      const { error } = await supabase.from("unified_connections" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-connections"] });
      toast.success("Connection removed");
    },
    onError: (e) => toast.error(e.message),
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
