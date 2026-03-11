import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useIsAdmin = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
  });

  return { isAdmin: query.data ?? false, isLoading: query.isLoading };
};

export const useAdminData = () => {
  const { isAdmin } = useIsAdmin();

  const profiles = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const businesses = useQuery({
    queryKey: ["admin-businesses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_profiles").select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const leads = useQuery({
    queryKey: ["admin-leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const channels = useQuery({
    queryKey: ["admin-channels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("channels").select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const subscriptions = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  return {
    profiles: profiles.data ?? [],
    businesses: businesses.data ?? [],
    leads: leads.data ?? [],
    channels: channels.data ?? [],
    subscriptions: subscriptions.data ?? [],
    isLoading: profiles.isLoading || businesses.isLoading || leads.isLoading,
  };
};
