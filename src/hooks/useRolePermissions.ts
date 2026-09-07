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
  | "freelancer"
  | "ambassador"
  | "support_agent"
  | "staff"
  | "accountant";

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
  // Granular channel/integration permissions
  canConnectOAuth: boolean;
  canReconnectOAuth: boolean;
  canDisconnectOAuth: boolean;
  canTestConnections: boolean;
  canManageProviderAccounts: boolean;
  canConnectApiToken: boolean;
  canManagePlatformProviders: boolean;
  // New permissions (v2)
  canViewConnectionLogs: boolean;
  canRotateSecrets: boolean;
  canManageBusinessScopedIntegrations: boolean;
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
  canConnectOAuth: false,
  canReconnectOAuth: false,
  canDisconnectOAuth: false,
  canTestConnections: false,
  canManageProviderAccounts: false,
  canConnectApiToken: false,
  canManagePlatformProviders: false,
  canViewConnectionLogs: false,
  canRotateSecrets: false,
  canManageBusinessScopedIntegrations: false,
};

const ALL_PERMISSIONS: RolePermissions = Object.keys(BASE_PERMISSIONS).reduce(
  (acc, key) => {
    (acc as any)[key] = true;
    return acc;
  },
  {} as RolePermissions,
);

const ROLE_PERMISSIONS: Record<AppRole, RolePermissions> = {
  // Platform owner: unrestricted access to every area of the platform.
  super_admin: { ...ALL_PERMISSIONS },

  admin: {
    ...BASE_PERMISSIONS,
    canCreateAdmin: true,
    canCreateController: true,
    canCreateWorker: true,
    canReviewBusinesses: true,
    canApprovePayouts: true,
    canManageCommissions: true,
    // Platform admins work only inside explicitly assigned workspaces.
    // The Owner/super_admin retains the global platform view.
    canViewAllWorkspaces: false,
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
    // Admin gets full OAuth management via RBAC
    canConnectOAuth: true,
    canReconnectOAuth: true,
    canDisconnectOAuth: true,
    canTestConnections: true,
    canManageProviderAccounts: true,
    canConnectApiToken: true,
    canManagePlatformProviders: true,
    canViewConnectionLogs: true,
    canRotateSecrets: true,
    canManageBusinessScopedIntegrations: true,
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
    canConnectChannels: true,
    canManageIntegrations: true,
    canManageTeam: true,
    canViewCRM: true,
    canManageCampaigns: true,
    canRespondInbox: true,
    canViewAnalytics: true,
    canConfigureAutomations: true,
    // Business owners may connect provider accounts scoped to their own workspace.
    canConnectOAuth: true,
    canReconnectOAuth: true,
    canDisconnectOAuth: true,
    canConnectApiToken: true,
    canTestConnections: true,
    canManageProviderAccounts: true,
    canManagePlatformProviders: false,
    canViewConnectionLogs: true,
    canManageBusinessScopedIntegrations: true,
  },
  business_manager: {
    ...BASE_PERMISSIONS,
    canViewCRM: true,
    canManageCampaigns: true,
    canRespondInbox: true,
    canViewAnalytics: true,
    canConfigureAutomations: true,
    canManageTeam: true,
    canAccessBilling: false,
    canConnectChannels: false,
    canManageIntegrations: false,
  },
  agent: {
    ...BASE_PERMISSIONS,
    canRespondInbox: true,
    canViewCRM: true,
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
    canViewAllWorkspaces: false,
    canChangePlans: false,
    // Freelancer connects via API/token/webhook — not OAuth
    canConnectOAuth: false,
    canConnectApiToken: true,
    canTestConnections: true,
    canManageProviderAccounts: false,
    canManagePlatformProviders: false,
    canViewConnectionLogs: true,
    canManageBusinessScopedIntegrations: true,
  },
  partner: {
    ...BASE_PERMISSIONS,
    canRegisterBusiness: true,
    canAccessBilling: true,
    canCreateReferralLinks: true,
    canViewAnalytics: true,
    canConnectChannels: false,
    canManageIntegrations: false,
  },
  ambassador: {
    ...BASE_PERMISSIONS,
    canCreateReferralLinks: true,
    canViewAnalytics: true,
    // Ambassador connects via API/token for their own tools
    canConnectChannels: true,
    canConnectApiToken: true,
    canTestConnections: true,
    // Ambassador is referral-only, no business management
  },
  // These database roles are intentionally explicit and deny-by-default.
  // Their scopes must be approved before any capability is enabled.
  support_agent: { ...BASE_PERMISSIONS },
  staff: { ...BASE_PERMISSIONS },
  accountant: { ...BASE_PERMISSIONS },
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
  const isAmbassador = hasRole("ambassador");
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
    isAmbassador,
    isSystemRole,
    isLoading,
  };
};
