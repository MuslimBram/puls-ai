import { Navigate } from "react-router-dom";
import { useRolePermissions, type RolePermissions } from "@/hooks/useRolePermissions";
import { DashboardLayout } from "@/components/DashboardLayout";

interface PermissionRouteProps {
  children: React.ReactNode;
  /** The permission required to access this route. User is redirected to /dashboard if missing. */
  permission: keyof RolePermissions;
  /** Optional fallback path (defaults to /dashboard). */
  fallback?: string;
}

/**
 * Route guard that enforces a single permission from useRolePermissions().
 * - Admins/super_admins always pass (their permission set includes everything they need).
 * - Loading state shows the dashboard layout with a spinner to avoid layout flash.
 * - Unauthorized users are redirected, never shown the page contents.
 */
export const PermissionRoute = ({ children, permission, fallback = "/dashboard" }: PermissionRouteProps) => {
  const { permissions, isAdmin, isLoading } = useRolePermissions();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  // Admin/super_admin bypass — they get full access.
  if (isAdmin) return <>{children}</>;

  if (!permissions[permission]) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};
