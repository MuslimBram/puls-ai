import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface BusinessProfileData {
  business_name: string;
  short_description: string;
  industry: string;
  target_audience: string;
  mission_values: string;
  main_services: string;
  ai_tone: string;
  language: string;
}

export type BusinessProfileRecord = Database["public"]["Tables"]["business_profiles"]["Row"];

const getBusinessStorageKey = (userId: string, workspaceId: string) => `business_active_${userId}_${workspaceId}`;

export const useBusinessProfiles = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey: ["business-profiles", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as BusinessProfileRecord[];
    },
    enabled: !!user && !!workspace?.id,
  });
};

export const useActiveBusinessProfile = (businessId?: string) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const profilesQuery = useBusinessProfiles();
  const [storedBusinessId, setStoredBusinessId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !workspace?.id) {
      setStoredBusinessId(null);
      return;
    }

    const storageKey = getBusinessStorageKey(user.id, workspace.id);
    const savedBusinessId = localStorage.getItem(storageKey);
    const profiles = profilesQuery.data ?? [];

    if (businessId && profiles.some((profile) => profile.id === businessId)) {
      setStoredBusinessId(businessId);
      localStorage.setItem(storageKey, businessId);
      return;
    }

    if (savedBusinessId && profiles.some((profile) => profile.id === savedBusinessId)) {
      setStoredBusinessId(savedBusinessId);
      return;
    }

    const fallbackBusinessId = profiles[0]?.id ?? null;
    setStoredBusinessId(fallbackBusinessId);

    if (fallbackBusinessId) {
      localStorage.setItem(storageKey, fallbackBusinessId);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [businessId, profilesQuery.data, user?.id, workspace?.id]);

  const setActiveBusinessId = useCallback((id: string) => {
    setStoredBusinessId(id);
    if (user?.id && workspace?.id) {
      localStorage.setItem(getBusinessStorageKey(user.id, workspace.id), id);
    }
  }, [user?.id, workspace?.id]);

  const activeBusinessId = businessId ?? storedBusinessId;
  const profile = useMemo(
    () => (profilesQuery.data ?? []).find((item) => item.id === activeBusinessId) ?? null,
    [activeBusinessId, profilesQuery.data],
  );

  return {
    profile,
    profiles: profilesQuery.data ?? [],
    activeBusinessId,
    setActiveBusinessId,
    isLoading: profilesQuery.isLoading,
  };
};

export const useBusinessProfile = (businessId?: string) => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { profile, profiles, activeBusinessId, setActiveBusinessId, isLoading } = useActiveBusinessProfile(businessId);

  const upsert = useMutation({
    mutationFn: async (values: BusinessProfileData) => {
      if (!user?.id || !workspace?.id) {
        throw new Error("Not authenticated");
      }

      if (profile?.id) {
        const { error } = await supabase
          .from("business_profiles")
          .update(values)
          .eq("id", profile.id);

        if (error) throw error;
        return profile.id;
      }

      const { data, error } = await supabase
        .from("business_profiles")
        .insert({ ...values, user_id: user.id, workspace_id: workspace.id })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: (savedBusinessId) => {
      queryClient.invalidateQueries({ queryKey: ["business-profiles"] });
      if (savedBusinessId) setActiveBusinessId(savedBusinessId);
      toast.success("Business profile saved");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return {
    profile,
    profiles,
    activeBusinessId,
    setActiveBusinessId,
    isLoading,
    upsert,
  };
};
