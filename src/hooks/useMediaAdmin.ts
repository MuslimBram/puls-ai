import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

type MediaProviderSetting = Database["public"]["Tables"]["media_provider_settings"]["Row"];
type MediaUsagePolicy = Database["public"]["Tables"]["media_usage_policy"]["Row"];
type MediaGenerationError = Database["public"]["Tables"]["media_generation_errors"]["Row"];
type MediaUsageEvent = Database["public"]["Tables"]["media_usage_events"]["Row"];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const useMediaProviderSettings = () => {
  const { isAdmin } = useIsAdmin();

  return useQuery({
    queryKey: ["admin-media-provider-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_provider_settings")
        .select("*")
        .order("priority", { ascending: true })
        .order("provider_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MediaProviderSetting[];
    },
    enabled: isAdmin,
  });
};

export const useMediaUsagePolicies = () => {
  const { isAdmin } = useIsAdmin();

  return useQuery({
    queryKey: ["admin-media-usage-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_usage_policy")
        .select("*")
        .order("plan_key", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MediaUsagePolicy[];
    },
    enabled: isAdmin,
  });
};

export const useUpsertMediaProviderSetting = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      provider_key: string;
      provider_name: string;
      media_types: string[];
      is_enabled: boolean;
      is_mock: boolean;
      api_secret_name?: string | null;
      priority: number;
      config: Record<string, unknown>;
    }) => {
      const { error } = await supabase.from("media_provider_settings").upsert(
        {
          ...payload,
          updated_by: user?.id ?? null,
        },
        { onConflict: "provider_key" },
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-media-provider-settings"] });
      toast.success("Media provider saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useUpdateMediaUsagePolicy = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      daily_image_limit: number;
      daily_video_limit: number;
      max_video_seconds: number;
      allow_image_generation: boolean;
      allow_video_generation: boolean;
    }) => {
      const { error } = await supabase
        .from("media_usage_policy")
        .update({
          daily_image_limit: payload.daily_image_limit,
          daily_video_limit: payload.daily_video_limit,
          max_video_seconds: payload.max_video_seconds,
          allow_image_generation: payload.allow_image_generation,
          allow_video_generation: payload.allow_video_generation,
          updated_by: user?.id ?? null,
        })
        .eq("id", payload.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-media-usage-policies"] });
      queryClient.invalidateQueries({ queryKey: ["media-usage"] });
      toast.success("Daily media limits updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useMediaAdminAnalytics = () => {
  const { isAdmin } = useIsAdmin();

  const query = useQuery({
    queryKey: ["admin-media-analytics"],
    queryFn: async () => {
      const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

      const [eventsResult, errorsResult, activeResult] = await Promise.all([
        supabase
          .from("media_usage_events")
          .select("user_id, media_type, event_type, status, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("media_generation_errors")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("media_generations")
          .select("*", { count: "exact", head: true })
          .in("status", ["queued", "pending", "generating", "processing"]),
      ]);

      if (eventsResult.error) throw eventsResult.error;
      if (errorsResult.error) throw errorsResult.error;
      if (activeResult.error) throw activeResult.error;

      return {
        events: (eventsResult.data ?? []) as Pick<MediaUsageEvent, "user_id" | "media_type" | "event_type" | "status" | "created_at">[],
        errors: (errorsResult.data ?? []) as MediaGenerationError[],
        activeCount: activeResult.count ?? 0,
      };
    },
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  return useMemo(() => {
    const events = query.data?.events ?? [];
    const errors = query.data?.errors ?? [];
    const perUser = Object.values(
      events.reduce<Record<string, { userId: string; images: number; videos: number; failed: number; total: number }>>((acc, event) => {
        const key = event.user_id ?? "unknown";
        if (!acc[key]) {
          acc[key] = { userId: key, images: 0, videos: 0, failed: 0, total: 0 };
        }

        acc[key].total += 1;
        if (event.event_type === "completed" && event.media_type === "image") acc[key].images += 1;
        if (event.event_type === "completed" && event.media_type === "video") acc[key].videos += 1;
        if (event.event_type === "failed") acc[key].failed += 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return {
      isLoading: query.isLoading,
      totalRequests: events.filter((event) => event.event_type === "requested").length,
      totalCompleted: events.filter((event) => event.event_type === "completed").length,
      totalFailed: events.filter((event) => event.event_type === "failed").length,
      activeCount: query.data?.activeCount ?? 0,
      perUser,
      errors,
    };
  }, [query.data, query.isLoading]);
};
