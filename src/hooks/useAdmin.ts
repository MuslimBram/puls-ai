import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useAuditLog } from "@/hooks/useAuditLog";
import { toast } from "@/components/ui/sonner";

export const useIsAdmin = () => {
  const { isAdmin, isLoading } = useRolePermissions();

  return {
    // Vetëm admin/super_admin kanë akses në panelin Admin
    isAdmin,
    isLoading,
  };
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

  const auditLogs = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
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
    auditLogs: auditLogs.data ?? [],
    isLoading: profiles.isLoading || businesses.isLoading || leads.isLoading,
  };
};

export const useAdminActions = () => {
  const queryClient = useQueryClient();
  const { log } = useAuditLog();

  const suspendUser = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_suspended: suspend } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: async (_, { userId, suspend }) => {
      await log(suspend ? "user_suspended" : "user_reactivated", "user", userId);
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
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
    onSuccess: async (_, userId) => {
      await log("usage_reset", "subscription", userId);
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
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
    onSuccess: async (_, { userId, plan }) => {
      await log("plan_override", "subscription", userId, { new_plan: plan });
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success("Plan updated");
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  return { suspendUser, resetUsage, updatePlan };
};
