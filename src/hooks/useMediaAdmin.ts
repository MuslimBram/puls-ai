import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

type MediaProviderSetting = Database["public"]["Tables"]["media_provider_settings"]["Row"];
type PricingSettingRow = Database["public"]["Tables"]["pricing_settings"]["Row"];
type MediaGenerationError = Database["public"]["Tables"]["media_generation_errors"]["Row"];
type MediaUsageEvent = Database["public"]["Tables"]["media_usage_events"]["Row"];

export interface MediaProviderCredentialSummary {
  providerKey: string;
  credentialType: string;
  credentialLabel: string | null;
  secretHint: string | null;
  isValid: boolean;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  updatedAt: string;
}

export interface MediaUsagePolicy {
  id: string;
  plan_key: string;
  daily_image_limit: number;
  daily_video_limit: number;
  max_video_seconds: number;
  media_generation_enabled: boolean;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const asEntitlements = (value: Json | null): Record<string, boolean> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>((acc, [key, entry]) => {
    if (typeof entry === "boolean") acc[key] = entry;
    return acc;
  }, {});
};

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

export const useMediaProviderCredentials = () => {
  const { isAdmin } = useIsAdmin();

  return useQuery({
    queryKey: ["admin-media-provider-credentials"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-media-provider-credentials", {
        body: { action: "list" },
      });

      if (error) throw new Error(error.message || "Failed to load provider credentials");
      return (data?.credentials ?? []) as MediaProviderCredentialSummary[];
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
        .from("pricing_settings")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("plan_key", { ascending: true });

      if (error) throw error;

      return ((data ?? []) as PricingSettingRow[])
        .filter((row) => !row.is_donation)
        .map<MediaUsagePolicy>((row) => {
          const entitlements = asEntitlements(row.feature_entitlements);
          return {
            id: row.id,
            plan_key: row.plan_key,
            daily_image_limit: row.daily_image_limit ?? 0,
            daily_video_limit: row.daily_video_limit ?? 0,
            max_video_seconds: row.max_video_seconds ?? 0,
            media_generation_enabled: Boolean(entitlements.mediaGeneration),
          };
        });
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
        } as any,
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

export const useUpsertMediaProviderCredential = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      providerKey: string;
      secret: string;
      credentialLabel?: string;
      credentialType?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("manage-media-provider-credentials", {
        body: {
          action: "upsert",
          providerKey: payload.providerKey,
          secret: payload.secret,
          credentialLabel: payload.credentialLabel ?? null,
          credentialType: payload.credentialType ?? "api_key",
        },
      });

      if (error) throw new Error(error.message || "Failed to save provider credential");
      return data as { validationMessage?: string; credential?: MediaProviderCredentialSummary };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-media-provider-credentials"] });
      toast.success(data?.validationMessage || "Provider secret stored securely");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useDeleteMediaProviderCredential = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerKey: string) => {
      const { error } = await supabase.functions.invoke("manage-media-provider-credentials", {
        body: {
          action: "delete",
          providerKey,
        },
      });

      if (error) throw new Error(error.message || "Failed to delete provider credential");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-media-provider-credentials"] });
      toast.success("Stored provider secret removed");
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
      media_generation_enabled: boolean;
    }) => {
      const { data: existing, error: existingError } = await supabase
        .from("pricing_settings")
        .select("feature_entitlements")
        .eq("id", payload.id)
        .single();

      if (existingError) throw existingError;

      const featureEntitlements = {
        ...asEntitlements((existing?.feature_entitlements ?? null) as Json | null),
        mediaGeneration: payload.media_generation_enabled,
      };

      const { error } = await supabase
        .from("pricing_settings")
        .update({
          daily_image_limit: payload.daily_image_limit,
          daily_video_limit: payload.daily_video_limit,
          max_video_seconds: payload.max_video_seconds,
          feature_entitlements: featureEntitlements,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", payload.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-media-usage-policies"] });
      queryClient.invalidateQueries({ queryKey: ["pricing-settings"] });
      queryClient.invalidateQueries({ queryKey: ["monetization-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["media-usage"] });
      toast.success("Media entitlements updated");
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
