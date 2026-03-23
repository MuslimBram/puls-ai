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
  const { isAdmin } = useRolePermissions();
  const [selectedRole, setSelectedRole] = useState<AppRole>("admin");
  const canManageRoles = isAdmin;

  const rolesQuery = useQuery({
    queryKey: ["admin-all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const allRoles = rolesQuery.data ?? [];
  const getRolesForUser = (userId: string) => allRoles.filter((r) => r.user_id === userId).map((r) => r.role);

  const assignRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      if (!canManageRoles) throw new Error("Only admins can assign roles");
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: async (_, { userId, role }) => {
      await log("role_assigned", "user", userId, { role });
      queryClient.invalidateQueries({ queryKey: ["admin-all-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success(`Role "${role}" assigned successfully`);
    },
    onError: (e: Error) => {
      if (e.message?.includes("duplicate")) {
        toast.error("User already has this role");
      } else {
        toast.error(`Failed: ${e.message}`);
      }
    },
  });

  const removeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      if (!canManageRoles) throw new Error("Only admins can remove roles");
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
          {canManageRoles ? "Assign or remove roles for platform users" : "Only admins can assign/remove roles"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!canManageRoles ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You have admin panel access as owner, but role changes are restricted to admin users.
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
                            if (!canManageRoles) {
                              toast.error("Only admins can remove roles");
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
                            <span className="flex items-center gap-1.5">
                              {r.icon} {r.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!canManageRoles || assignRole.isPending || userRoles.includes(selectedRole)}
                      onClick={() => assignRole.mutate({ userId: p.user_id, role: selectedRole })}
                    >
                      <ShieldPlus className="h-3 w-3 mr-1" />
                      Assign
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
