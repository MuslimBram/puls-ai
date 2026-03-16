import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface ConfigVersion {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  change_type: string;
  previous_snapshot: Record<string, unknown>;
  current_snapshot: Record<string, unknown>;
  change_summary: string | null;
  created_at: string;
}

export const useConfigVersions = (entityType?: string, entityId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["config-versions", user?.id, entityType, entityId],
    queryFn: async () => {
      let q = supabase
        .from("config_versions" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (entityType) q = q.eq("entity_type", entityType);
      if (entityId) q = q.eq("entity_id", entityId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ConfigVersion[];
    },
    enabled: !!user,
  });

  const trackChange = useMutation({
    mutationFn: async (params: {
      entity_type: string;
      entity_id: string;
      change_type: string;
      previous_snapshot: Record<string, unknown>;
      current_snapshot: Record<string, unknown>;
      change_summary?: string;
    }) => {
      const { error } = await supabase.from("config_versions" as any).insert({
        user_id: user!.id,
        ...params,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config-versions"] }),
  });

  return { versions: query.data ?? [], isLoading: query.isLoading, trackChange };
};

export interface BusinessNotification {
  id: string;
  user_id: string;
  notification_type: string;
  category: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  is_dismissed: boolean;
  action_url: string | null;
  created_at: string;
}

export const useBusinessNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["business-notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_notifications" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as BusinessNotification[];
    },
    enabled: !!user,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("business_notifications" as any)
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("business_notifications" as any)
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-notifications"] }),
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("business_notifications" as any)
        .update({ is_dismissed: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-notifications"] }),
  });

  const unreadCount = (query.data ?? []).filter((n) => !n.is_read).length;

  return {
    notifications: query.data ?? [],
    unreadCount,
    isLoading: query.isLoading,
    markRead,
    markAllRead,
    dismiss,
  };
};

export interface HealthScore {
  id: string;
  overall_score: number;
  lead_volume_score: number;
  channel_activity_score: number;
  response_speed_score: number;
  campaign_engagement_score: number;
  automation_usage_score: number;
  breakdown: Record<string, unknown>;
  suggestions: string[];
  computed_at: string;
}

export const useHealthScores = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["health-scores", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_scores" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("computed_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as HealthScore[];
    },
    enabled: !!user,
  });

  const runAnalysis = useMutation({
    mutationFn: async (workspaceId?: string) => {
      const { data, error } = await supabase.functions.invoke("business-insight-ai", {
        body: { user_id: user!.id, workspace_id: workspaceId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Business analysis completed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    scores: query.data ?? [],
    latest: query.data?.[0] ?? null,
    isLoading: query.isLoading,
    runAnalysis,
  };
};
