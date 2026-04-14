import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface N8nConfiguration {
  id: string;
  workspace_id: string;
  user_id: string;
  base_url: string;
  status: "pending" | "connected" | "error" | "disconnected";
  last_tested_at: string | null;
  last_error: string | null;
  event_mappings: {
    new_lead: string | null;
    new_message: string | null;
    form_submit: string | null;
    payment_success: string | null;
  };
  created_at: string;
  updated_at: string;
}

export const useN8nConfig = (workspaceId?: string) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["n8n-config", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("n8n_configurations" as any)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as N8nConfiguration | null;
    },
    enabled: !!user && !!workspaceId,
  });

  const saveConfig = useMutation({
    mutationFn: async (params: {
      base_url: string;
      event_mappings?: Record<string, string | null>;
    }) => {
      const existing = query.data;
      if (existing) {
        const { error } = await supabase
          .from("n8n_configurations" as any)
          .update({
            base_url: params.base_url,
            event_mappings: params.event_mappings || existing.event_mappings,
          } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("n8n_configurations" as any).insert({
          workspace_id: workspaceId,
          user_id: user!.id,
          base_url: params.base_url,
          event_mappings: params.event_mappings || {
            new_lead: null,
            new_message: null,
            form_submit: null,
            payment_success: null,
          },
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["n8n-config"] });
      toast.success("n8n configuration saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const testConnection = useMutation({
    mutationFn: async () => {
      const config = query.data;
      if (!config) throw new Error("No n8n configuration found");

      try {
        // Simple health check
        const resp = await fetch(`${config.base_url}/healthz`, {
          method: "GET",
          signal: AbortSignal.timeout(10000),
        });

        const status = resp.ok ? "connected" : "error";
        const lastError = resp.ok ? null : `HTTP ${resp.status}`;

        await supabase
          .from("n8n_configurations" as any)
          .update({
            status,
            last_tested_at: new Date().toISOString(),
            last_error: lastError,
          } as any)
          .eq("id", config.id);

        if (!resp.ok) throw new Error(`n8n returned ${resp.status}`);
      } catch (err: any) {
        await supabase
          .from("n8n_configurations" as any)
          .update({
            status: "error",
            last_tested_at: new Date().toISOString(),
            last_error: err.message,
          } as any)
          .eq("id", config.id);
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["n8n-config"] });
      toast.success("n8n connection successful");
    },
    onError: (e) => toast.error(`n8n test failed: ${e.message}`),
  });

  return {
    config: query.data,
    isLoading: query.isLoading,
    saveConfig,
    testConnection,
  };
};
