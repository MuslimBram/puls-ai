import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface ApiKey {
  id: string;
  key_prefix: string;
  label: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  usage_count: number;
  rate_limit_per_minute: number;
  created_at: string;
  revoked_at: string | null;
}

export interface ApiRequestLog {
  id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  ip_address: string | null;
  created_at: string;
}

export const usePublicApi = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const keysQuery = useQuery({
    queryKey: ["api-keys", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-api-keys", {
        body: { action: "list" },
      });
      if (error) throw error;
      return (data?.keys || []) as ApiKey[];
    },
    enabled: !!user,
  });

  const logsQuery = useQuery({
    queryKey: ["api-logs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-api-keys", {
        body: { action: "logs" },
      });
      if (error) throw error;
      return (data?.logs || []) as ApiRequestLog[];
    },
    enabled: !!user,
  });

  const createKey = useMutation({
    mutationFn: async (params: { label: string; permissions: string[]; workspace_id?: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-api-keys", {
        body: { action: "create", ...params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API Key Created", description: `Key: ${data.raw_key}\n\nCopy it now — it won't be shown again.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeKey = useMutation({
    mutationFn: async (keyId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-api-keys", {
        body: { action: "revoke", key_id: keyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API Key revoked" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return { keys: keysQuery.data || [], logs: logsQuery.data || [], isLoading: keysQuery.isLoading, createKey, revokeKey };
};

export const useZapierWebhooks = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["zapier-webhooks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zapier_webhooks" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const addWebhook = useMutation({
    mutationFn: async (params: { webhook_url: string; event_type: string; label?: string; workspace_id?: string }) => {
      const { error } = await supabase.from("zapier_webhooks" as any).insert({
        user_id: user!.id,
        ...params,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zapier-webhooks"] });
      toast({ title: "Webhook added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("zapier_webhooks" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zapier-webhooks"] });
      toast({ title: "Webhook removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("zapier_webhooks" as any).update({ is_active } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["zapier-webhooks"] }),
  });

  return { webhooks: query.data || [], isLoading: query.isLoading, addWebhook, removeWebhook, toggleWebhook };
};
