import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuditLog } from "@/hooks/useAuditLog";
import { toast } from "@/components/ui/sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldPlus, ShieldMinus, Crown, Shield, Users } from "lucide-react";
import { useRolePermissions, type AppRole } from "@/hooks/useRolePermissions";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  created_at: string;
}

const ASSIGNABLE_ROLES: { value: AppRole; label: string; icon: React.ReactNode }[] = [
  { value: "admin", label: "Admin", icon: <Crown className="h-3 w-3" /> },
  { value: "controller", label: "Controller", icon: <Shield className="h-3 w-3" /> },
  { value: "worker", label: "Worker", icon: <Users className="h-3 w-3" /> },
  { value: "moderator", label: "Moderator", icon: <Shield className="h-3 w-3" /> },
];

const ROLE_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  super_admin: "destructive",
  admin: "default",
  controller: "secondary",
  worker: "outline",
  moderator: "secondary",
  business_owner: "outline",
  partner: "outline",
  user: "outline",
};

export const AdminRoleManager = ({ profiles }: { profiles: Profile[] }) => {
  const queryClient = useQueryClient();
  const { log } = useAuditLog();
  const { isSuperAdmin } = useRolePermissions();
  const [selectedRole, setSelectedRole] = useState<AppRole>("admin");
  const canManageRoles = isSuperAdmin;
  const canManageRole = (role: AppRole) => isSuperAdmin && ASSIGNABLE_ROLES.some((r) => r.value === role);

  const rolesQuery = useQuery({
    queryKey: ["admin-all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data || [];
    },
    enabled: canManageRoles,
  });

  const allRoles = rolesQuery.data ?? [];
  const getRolesForUser = (userId: string) => allRoles.filter((r) => r.user_id === userId).map((r) => r.role);

  const assignRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      if (!canManageRole(role)) throw new Error("Only the platform owner can manage platform roles");

      if (role === "admin") {
        const { error } = await supabase.rpc("request_admin_role" as any, {
          _target_user_id: userId,
        } as any);
        if (error) throw error;
        return "requested" as const;
      }

      if (!( ["controller", "worker", "moderator"] as AppRole[]).includes(role)) {
        throw new Error("This role is not assignable from the platform admin UI");
      }

      const { error } = await supabase.rpc("grant_platform_operational_role" as any, {
        _target_user_id: userId,
        _role: role,
      } as any);
      if (error) throw error;
      return "assigned" as const;
    },
    onSuccess: async (result, { userId, role }) => {
      await log(result === "requested" ? "role_assignment_requested" : "role_assigned", "user", userId, { role });
      queryClient.invalidateQueries({ queryKey: ["admin-all-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success(result === "requested" ? "Admin request submitted for approval" : `Role "${role}" assigned successfully`);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const removeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      if (!canManageRole(role as AppRole)) throw new Error("Only the platform owner can manage platform roles");
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (error) throw error;
    },
    onSuccess: async (_, { userId, role }) => {
      await log("role_removed", "user", userId, { role });
      queryClient.invalidateQueries({ queryKey: ["admin-all-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success(`Role "${role}" removed`);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldPlus className="h-4 w-4" />
          Role Management
        </CardTitle>
        <CardDescription>
          {isSuperAdmin
            ? "Manage platform roles and protected admin elevation."
            : "Platform role management is restricted to the platform owner."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!canManageRoles ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Platform role changes are restricted to the platform owner.
          </p>
        ) : profiles.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No users found</p>
        ) : (
          <div className="space-y-2">
            {profiles.map((p) => {
              const userRoles = getRolesForUser(p.user_id);
              return (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{p.full_name || "No name"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.user_id}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {userRoles.map((role) => (
                        <Badge
                          key={role}
                          variant={ROLE_COLORS[role] || "outline"}
                          className="text-xs cursor-pointer hover:opacity-70 gap-1"
                          onClick={() => {
                            if (!canManageRole(role as AppRole)) {
                              toast.error("You don't have permission to remove this role");
                              return;
                            }
                            if (role === "user") {
                              toast.error("Cannot remove the base 'user' role");
                              return;
                            }
                            if (confirm(`Remove role "${role}" from ${p.full_name || p.user_id}?`)) {
                              removeRole.mutate({ userId: p.user_id, role });
                            }
                          }}
                        >
                          {role}
                          {role !== "user" && <ShieldMinus className="h-2.5 w-2.5" />}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            <span className="flex items-center gap-1.5">{r.icon} {r.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!canManageRole(selectedRole) || assignRole.isPending || userRoles.includes(selectedRole)}
                      onClick={() => assignRole.mutate({ userId: p.user_id, role: selectedRole })}
                    >
                      <ShieldPlus className="h-3 w-3 mr-1" />
                      {selectedRole === "admin" ? "Request" : "Assign"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};