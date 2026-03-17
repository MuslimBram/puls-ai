import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "super_admin" | "controller" | "worker" | "user" | "moderator" | "business_owner" | "partner";

export interface RolePermissions {
  canCreateAdmin: boolean;
  canCreateController: boolean;
  canCreateWorker: boolean;
  canRegisterBusiness: boolean;
  canReviewBusinesses: boolean;
  canApprovePayouts: boolean;
  canManageCommissions: boolean;
  canAccessBilling: boolean;
  canCreateReferralLinks: boolean;
  canViewAllWorkspaces: boolean;
  canSuspendUsers: boolean;
  canChangePlans: boolean;
  bypassSubscription: boolean;
  bypassFeatureGating: boolean;
  bypassUsageLimits: boolean;
}

const ROLE_PERMISSIONS: Record<AppRole, RolePermissions> = {
  super_admin: {
    canCreateAdmin: true,
    canCreateController: true,
    canCreateWorker: true,
    canRegisterBusiness: false,
    canReviewBusinesses: true,
    canApprovePayouts: true,
    canManageCommissions: true,
    canAccessBilling: false,
    canCreateReferralLinks: false,
    canViewAllWorkspaces: true,
    canSuspendUsers: true,
    canChangePlans: true,
    bypassSubscription: true,
    bypassFeatureGating: true,
    bypassUsageLimits: true,
  },
  admin: {
    canCreateAdmin: true,
    canCreateController: true,
    canCreateWorker: true,
    canRegisterBusiness: false,
    canReviewBusinesses: true,
    canApprovePayouts: true,
    canManageCommissions: true,
    canAccessBilling: false,
    canCreateReferralLinks: false,
    canViewAllWorkspaces: true,
    canSuspendUsers: true,
    canChangePlans: true,
    bypassSubscription: true,
    bypassFeatureGating: true,
    bypassUsageLimits: true,
  },
  controller: {
    canCreateAdmin: false,
    canCreateController: false,
    canCreateWorker: false,
    canRegisterBusiness: false,
    canReviewBusinesses: true,
    canApprovePayouts: false,
    canManageCommissions: false,
    canAccessBilling: false,
    canCreateReferralLinks: false,
    canViewAllWorkspaces: true,
    canSuspendUsers: false,
    canChangePlans: false,
    bypassSubscription: false,
    bypassFeatureGating: false,
    bypassUsageLimits: false,
  },
  worker: {
    canCreateAdmin: false,
    canCreateController: false,
    canCreateWorker: false,
    canRegisterBusiness: true,
    canReviewBusinesses: false,
    canApprovePayouts: false,
    canManageCommissions: false,
    canAccessBilling: false,
    canCreateReferralLinks: false,
    canViewAllWorkspaces: false,
    canSuspendUsers: false,
    canChangePlans: false,
    bypassSubscription: false,
    bypassFeatureGating: false,
    bypassUsageLimits: false,
  },
  moderator: {
    canCreateAdmin: false,
    canCreateController: false,
    canCreateWorker: false,
    canRegisterBusiness: false,
    canReviewBusinesses: true,
    canApprovePayouts: false,
    canManageCommissions: false,
    canAccessBilling: false,
    canCreateReferralLinks: false,
    canViewAllWorkspaces: false,
    canSuspendUsers: false,
    canChangePlans: false,
    bypassSubscription: false,
    bypassFeatureGating: false,
    bypassUsageLimits: false,
  },
  business_owner: {
    canCreateAdmin: false,
    canCreateController: false,
    canCreateWorker: false,
    canRegisterBusiness: true,
    canReviewBusinesses: false,
    canApprovePayouts: false,
    canManageCommissions: false,
    canAccessBilling: true,
    canCreateReferralLinks: true,
    canViewAllWorkspaces: false,
    canSuspendUsers: false,
    canChangePlans: false,
    bypassSubscription: false,
    bypassFeatureGating: false,
    bypassUsageLimits: false,
  },
  partner: {
    canCreateAdmin: false,
    canCreateController: false,
    canCreateWorker: false,
    canRegisterBusiness: true,
    canReviewBusinesses: false,
    canApprovePayouts: false,
    canManageCommissions: false,
    canAccessBilling: true,
    canCreateReferralLinks: true,
    canViewAllWorkspaces: false,
    canSuspendUsers: false,
    canChangePlans: false,
    bypassSubscription: false,
    bypassFeatureGating: false,
    bypassUsageLimits: false,
  },
  user: {
    canCreateAdmin: false,
    canCreateController: false,
    canCreateWorker: false,
    canRegisterBusiness: false,
    canReviewBusinesses: false,
    canApprovePayouts: false,
    canManageCommissions: false,
    canAccessBilling: false,
    canCreateReferralLinks: false,
    canViewAllWorkspaces: false,
    canSuspendUsers: false,
    canChangePlans: false,
    bypassSubscription: false,
    bypassFeatureGating: false,
    bypassUsageLimits: false,
  },
};

export const useUserRoles = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-all-roles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []).map((r) => r.role as AppRole);
    },
    enabled: !!user,
    staleTime: 300000,
  });
};

export const useRolePermissions = () => {
  const { data: roles = [], isLoading } = useUserRoles();

  // Merge permissions from all roles (most permissive wins)
  const permissions: RolePermissions = roles.reduce<RolePermissions>(
    (acc, role) => {
      const rp = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
      return Object.keys(acc).reduce((merged, key) => {
        (merged as any)[key] = (acc as any)[key] || (rp as any)[key];
        return merged;
      }, {} as RolePermissions);
    },
    { ...ROLE_PERMISSIONS.user }
  );

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin") || hasRole("super_admin");
  const isSuperAdmin = hasRole("super_admin");
  const isController = hasRole("controller");
  const isWorker = hasRole("worker");
  const isSystemRole = isAdmin || isSuperAdmin;

  return {
    roles,
    permissions,
    hasRole,
    isAdmin,
    isSuperAdmin,
    isController,
    isWorker,
    isSystemRole,
    isLoading,
  };
};
