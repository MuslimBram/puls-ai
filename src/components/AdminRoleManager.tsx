import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldPlus, ShieldMinus, Crown, Shield, Users } from "lucide-react";
import { useRolePermissions, roleLabel, type AppRole } from "@/hooks/useRolePermissions";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  created_at: string;
}

interface AdminRoleRequest {
  id: string;
  target_user_id: string;
  requested_by: string;
  requested_role: AppRole;
  status: string;
  ai_status: string;
  ai_reason: string | null;
  created_at: string;
}

const ASSIGNABLE_ROLES: { value: AppRole; label: string; icon: React.ReactNode }[] = [
  { value: "admin", label: "Pulse AI Admin", icon: <Crown className="h-3 w-3" /> },
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
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin } = useRolePermissions();
  const [selectedRole, setSelectedRole] = useState<AppRole>("admin");
  const [approvalReasons, setApprovalReasons] = useState<Record<string, string>>({});
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

  const roleRequestsQuery = useQuery({
    queryKey: ["admin-role-requests", "pending"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_role_requests")
        .select("id, target_user_id, requested_by, requested_role, status, ai_status, ai_reason, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AdminRoleRequest[];
    },
    enabled: isAdmin,
  });

  const roleRequests = roleRequestsQuery.data ?? [];
  const profileByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const displayName = (userId: string) => profileByUserId.get(userId)?.full_name || userId;

  const decideAdminRequest = useMutation({
    mutationFn: async ({
      requestId,
      approve,
      reason,
    }: {
      requestId: string;
      approve: boolean;
      reason: string;
    }) => {
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 10) {
        throw new Error("A reason of at least 10 characters is required");
      }
      const functionName = approve ? "approve_admin_role" : "reject_admin_role";
      const { error } = await (supabase as any).rpc(functionName, {
        _request_id: requestId,
        _reason: trimmedReason,
      });
      if (error) throw error;
      return { requestId, approve };
    },
    onSuccess: async ({ requestId, approve }) => {
      await log(approve ? "admin_role_approved" : "admin_role_rejected", "admin_role_request", requestId, {
        approval_path: "ai_then_second_human_admin",
      });
      setApprovalReasons((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["admin-role-requests", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success(approve ? "Admin role approved" : "Admin request rejected");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

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
            ? "The Owner submits requests; AI review and a different Admin approval are required."
            : "Admins can review pending requests. Only the Owner can submit or change platform roles."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isAdmin && (
          <div className="mb-6 rounded-lg border border-border bg-muted/20 p-4">
            <div className="mb-3">
              <p className="text-sm font-medium text-foreground">Pending Admin approvals</p>
              <p className="text-xs text-muted-foreground">
                AI must approve first, then a different Admin must approve or reject with a reason.
              </p>
            </div>
            {roleRequestsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading pending requests…</p>
            ) : roleRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending Admin requests.</p>
            ) : (
              <div className="space-y-3">
                {roleRequests.map((request) => {
                  const reason = approvalReasons[request.id] ?? "";
                  const isRequester = request.requested_by === user?.id;
                  const aiApproved = request.ai_status === "approved";
                  return (
                    <div key={request.id} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {displayName(request.target_user_id)} → Admin
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Requested by {displayName(request.requested_by)}
                          </p>
                        </div>
                        <Badge variant={aiApproved ? "default" : "secondary"}>AI: {request.ai_status}</Badge>
                      </div>
                      {request.ai_reason && (
                        <p className="mt-2 text-xs text-muted-foreground">AI note: {request.ai_reason}</p>
                      )}
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={reason}
                          onChange={(event) =>
                            setApprovalReasons((current) => ({ ...current, [request.id]: event.target.value }))
                          }
                          placeholder="Reason (minimum 10 characters)"
                          maxLength={500}
                          disabled={isRequester || decideAdminRequest.isPending}
                          className="h-9 text-sm"
                        />
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={
                              isRequester ||
                              !aiApproved ||
                              reason.trim().length < 10 ||
                              decideAdminRequest.isPending
                            }
                            onClick={() =>
                              decideAdminRequest.mutate({ requestId: request.id, approve: true, reason })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isRequester || reason.trim().length < 10 || decideAdminRequest.isPending}
                            onClick={() =>
                              decideAdminRequest.mutate({ requestId: request.id, approve: false, reason })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                      {isRequester && (
                        <p className="mt-2 text-xs text-destructive">
                          You requested this change and cannot approve or reject it.
                        </p>
                      )}
                      {!aiApproved && !isRequester && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Approval stays disabled until the AI review is approved.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
                            if (confirm(`Remove role "${roleLabel(role)}" from ${p.full_name || p.user_id}?`)) {
                              removeRole.mutate({ userId: p.user_id, role });
                            }
                          }}
                        >
                          {roleLabel(role)}
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