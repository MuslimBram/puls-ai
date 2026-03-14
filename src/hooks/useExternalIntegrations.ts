import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface ExternalIntegration {
  id: string;
  integration_key: string;
  integration_name: string;
  category: string;
  description: string | null;
  status: string;
  is_enabled: boolean;
  credentials: Record<string, string>;
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

export const useExternalIntegrations = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["external-integrations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_integrations" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("category");
      if (error) throw error;
      return (data || []) as unknown as ExternalIntegration[];
    },
    enabled: !!user,
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
      const existing = query.data?.find((i) => i.integration_key === params.integration_key);
      if (existing) {
        const { error } = await supabase
          .from("external_integrations" as any)
          .update({
            credentials: params.credentials,
            config: params.config,
            status: params.status ?? existing.status,
            is_enabled: params.is_enabled ?? existing.is_enabled,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("external_integrations" as any).insert({
          user_id: user!.id,
          integration_key: params.integration_key,
          integration_name: params.integration_name,
          category: params.category,
          description: params.description,
          credentials: params.credentials ?? {},
          config: params.config ?? {},
          status: params.status ?? "planned",
          is_enabled: params.is_enabled ?? false,
          rate_limit_per_hour: params.rate_limit_per_hour ?? 2,
          min_scan_interval_minutes: params.min_scan_interval_minutes ?? 30,
          keyword_match_threshold: params.keyword_match_threshold ?? 0.6,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-integrations"] });
      toast.success("Integration saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleIntegration = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase
        .from("external_integrations" as any)
        .update({ is_enabled, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["external-integrations"] }),
  });

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_integrations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-integrations"] });
      toast.success("Integration removed");
    },
    onError: (e) => toast.error(e.message),
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

  return useQuery({
    queryKey: ["integration-event-logs", integrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_event_logs" as any)
        .select("*")
        .eq("integration_id", integrationId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as IntegrationEventLog[];
    },
    enabled: !!user && !!integrationId,
  });
};
