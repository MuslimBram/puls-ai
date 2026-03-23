import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole =
  | "admin"
  | "super_admin"
  | "controller"
  | "worker"
  | "user"
  | "moderator"
  | "business_owner"
  | "partner"
  | "business_manager"
  | "agent"
  | "freelancer";

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
  canConnectChannels: boolean;
  canManageIntegrations: boolean;
  canManageTeam: boolean;
  canViewCRM: boolean;
  canManageCampaigns: boolean;
  canRespondInbox: boolean;
  canViewAnalytics: boolean;
  canConfigureAutomations: boolean;
  canMonitorConnections: boolean;
}

const BASE_PERMISSIONS: RolePermissions = {
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
  canConnectChannels: false,
  canManageIntegrations: false,
  canManageTeam: false,
  canViewCRM: false,
  canManageCampaigns: false,
  canRespondInbox: false,
  canViewAnalytics: false,
  canConfigureAutomations: false,
  canMonitorConnections: false,
};

const ROLE_PERMISSIONS: Record<AppRole, RolePermissions> = {
  super_admin: {
    ...BASE_PERMISSIONS,
    canCreateAdmin: true,
    canCreateController: true,
    canCreateWorker: true,
    canReviewBusinesses: true,
    canApprovePayouts: true,
    canManageCommissions: true,
    canViewAllWorkspaces: true,
    canSuspendUsers: true,
    canChangePlans: true,
    bypassSubscription: true,
    bypassFeatureGating: true,
    bypassUsageLimits: true,
    canViewCRM: true,
    canViewAnalytics: true,
    canMonitorConnections: true,
    // NOTE: super_admin must NOT connect channels on behalf of businesses
    canConnectChannels: false,
  },
  admin: {
    ...BASE_PERMISSIONS,
    canCreateAdmin: true,
    canCreateController: true,
    canCreateWorker: true,
    canReviewBusinesses: true,
    canApprovePayouts: true,
    canManageCommissions: true,
    canViewAllWorkspaces: true,
    canSuspendUsers: true,
    canChangePlans: true,
    bypassSubscription: true,
    bypassFeatureGating: true,
    bypassUsageLimits: true,
    canConnectChannels: true,
    canManageIntegrations: true,
    canManageTeam: true,
    canViewCRM: true,
    canManageCampaigns: true,
    canRespondInbox: true,
    canViewAnalytics: true,
    canConfigureAutomations: true,
    canMonitorConnections: true,
  },
  controller: {
    ...BASE_PERMISSIONS,
    canReviewBusinesses: true,
    canViewAllWorkspaces: true,
    canViewAnalytics: true,
    canMonitorConnections: true,
  },
  worker: {
    ...BASE_PERMISSIONS,
    canRegisterBusiness: true,
  },
  moderator: {
    ...BASE_PERMISSIONS,
    canReviewBusinesses: true,
    canRespondInbox: true,
  },
  business_owner: {
    ...BASE_PERMISSIONS,
    canRegisterBusiness: true,
    canAccessBilling: true,
    canCreateReferralLinks: true,
    bypassSubscription: true,
    bypassFeatureGating: true,
    bypassUsageLimits: true,
    canConnectChannels: true,
    canManageIntegrations: true,
    canManageTeam: true,
    canViewCRM: true,
    canManageCampaigns: true,
    canRespondInbox: true,
    canViewAnalytics: true,
    canConfigureAutomations: true,
  },
  business_manager: {
    ...BASE_PERMISSIONS,
    canViewCRM: true,
    canManageCampaigns: true,
    canRespondInbox: true,
    canViewAnalytics: true,
    canConfigureAutomations: true,
    canManageTeam: true,
    // Cannot change billing or core integrations
    canAccessBilling: false,
    canConnectChannels: false,
    canManageIntegrations: false,
  },
  agent: {
    ...BASE_PERMISSIONS,
    canRespondInbox: true,
    canViewCRM: true,
    // Cannot access billing, integrations, pricing, or create campaigns
    canAccessBilling: false,
    canConnectChannels: false,
    canManageIntegrations: false,
    canManageCampaigns: false,
  },
  freelancer: {
    ...BASE_PERMISSIONS,
    canConnectChannels: true,
    canManageIntegrations: true,
    canViewCRM: true,
    canManageCampaigns: true,
    canRespondInbox: true,
    canViewAnalytics: true,
    canConfigureAutomations: true,
    canRegisterBusiness: true,
    // Cannot see other businesses or change global settings
    canViewAllWorkspaces: false,
    canChangePlans: false,
  },
  partner: {
    ...BASE_PERMISSIONS,
    canRegisterBusiness: true,
    canAccessBilling: true,
    canCreateReferralLinks: true,
    canViewAnalytics: true,
    // Cannot control business internal operations
    canConnectChannels: false,
    canManageIntegrations: false,
  },
  user: {
    ...BASE_PERMISSIONS,
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

  const permissions: RolePermissions = roles.reduce<RolePermissions>(
    (acc, role) => {
      const rp = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
      return Object.keys(acc).reduce((merged, key) => {
        (merged as any)[key] = (acc as any)[key] || (rp as any)[key];
        return merged;
      }, {} as RolePermissions);
    },
    { ...ROLE_PERMISSIONS.user },
  );

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin") || hasRole("super_admin");
  const isSuperAdmin = hasRole("super_admin");
  const isController = hasRole("controller");
  const isWorker = hasRole("worker");
  const isFreelancer = hasRole("freelancer");
  const isBusinessOwner = hasRole("business_owner");
  const isBusinessManager = hasRole("business_manager");
  const isAgent = hasRole("agent");
  const isSystemRole = isAdmin || isSuperAdmin;

  return {
    roles,
    permissions,
    hasRole,
    isAdmin,
    isSuperAdmin,
    isController,
    isWorker,
    isFreelancer,
    isBusinessOwner,
    isBusinessManager,
    isAgent,
    isSystemRole,
    isLoading,
  };
};
