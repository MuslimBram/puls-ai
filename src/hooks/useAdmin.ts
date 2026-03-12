import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

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

export const useAdminActions = () => {
  const queryClient = useQueryClient();

  const suspendUser = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_suspended: suspend } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, { suspend }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success(suspend ? "User suspended" : "User reactivated");
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const resetUsage = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ leads_used: 0, ai_replies_today: 0, ai_replies_reset_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast.success("Usage counters reset");
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const updatePlan = useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: string }) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ plan, subscription_status: "active" })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast.success("Plan updated");
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  return { suspendUser, resetUsage, updatePlan };
};
