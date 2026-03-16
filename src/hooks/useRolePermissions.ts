import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "controller" | "worker" | "user" | "moderator";

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
}

const ROLE_PERMISSIONS: Record<AppRole, RolePermissions> = {
  admin: {
    canCreateAdmin: true,
    canCreateController: true,
    canCreateWorker: true,
    canRegisterBusiness: true,
    canReviewBusinesses: true,
    canApprovePayouts: true,
    canManageCommissions: true,
    canAccessBilling: true,
    canCreateReferralLinks: true,
    canViewAllWorkspaces: true,
    canSuspendUsers: true,
    canChangePlans: true,
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
      return {
        canCreateAdmin: acc.canCreateAdmin || rp.canCreateAdmin,
        canCreateController: acc.canCreateController || rp.canCreateController,
        canCreateWorker: acc.canCreateWorker || rp.canCreateWorker,
        canRegisterBusiness: acc.canRegisterBusiness || rp.canRegisterBusiness,
        canReviewBusinesses: acc.canReviewBusinesses || rp.canReviewBusinesses,
        canApprovePayouts: acc.canApprovePayouts || rp.canApprovePayouts,
        canManageCommissions: acc.canManageCommissions || rp.canManageCommissions,
        canAccessBilling: acc.canAccessBilling || rp.canAccessBilling,
        canCreateReferralLinks: acc.canCreateReferralLinks || rp.canCreateReferralLinks,
        canViewAllWorkspaces: acc.canViewAllWorkspaces || rp.canViewAllWorkspaces,
        canSuspendUsers: acc.canSuspendUsers || rp.canSuspendUsers,
        canChangePlans: acc.canChangePlans || rp.canChangePlans,
      };
    },
    { ...ROLE_PERMISSIONS.user }
  );

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin");
  const isController = hasRole("controller");
  const isWorker = hasRole("worker");

  return {
    roles,
    permissions,
    hasRole,
    isAdmin,
    isController,
    isWorker,
    isLoading,
  };
};
