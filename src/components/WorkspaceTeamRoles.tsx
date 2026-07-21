import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { toast } from "@/components/ui/sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, ShieldPlus, ShieldMinus, Users } from "lucide-react";

interface WorkspaceMemberRow {
  user_id: string;
  role: string;
  full_name: string | null;
}

/**
 * Lets a workspace Owner promote teammates to the platform 'admin' role
 * (and demote them back), without exposing the full /admin platform panel.
 * Backed by RLS policies on user_roles that only allow business_owner
 * accounts to insert/update/delete the 'admin' role specifically.
 */
export const WorkspaceTeamRoles = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { isBusinessOwner, isAdmin } = useRolePermissions();
  const queryClient = useQueryClient();

  if (!isBusinessOwner && !isAdmin) return null;

  const membersQuery = useQuery({
    queryKey: ["workspace-team-roles", workspace?.id],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace!.id);
      if (error) throw error;

      const userIds = (members || []).map((m) => m.user_id);
      if (userIds.length === 0) return [] as WorkspaceMemberRow[];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "admin")
        .in("user_id", userIds);

      const adminSet = new Set((adminRoles || []).map((r) => r.user_id));
      const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));

      return (members || []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        full_name: nameMap.get(m.user_id) || null,
        is_platform_admin: adminSet.has(m.user_id),
      })) as (WorkspaceMemberRow & { is_platform_admin: boolean })[];
    },
    enabled: !!workspace?.id,
  });

  const promote = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-team-roles", workspace?.id] });
      toast.success("Promoted to Admin");
    },
    onError: (e: Error) => {
      if (e.message?.includes("duplicate")) {
        toast.error("This user is already an Admin");
      } else {
        toast.error(`Failed: ${e.message}`);
      }
    },
  });

  const demote = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-team-roles", workspace?.id] });
      toast.success("Moved back to Owner/Member");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const members = (membersQuery.data || []) as (WorkspaceMemberRow & { is_platform_admin: boolean })[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Team Roles
        </CardTitle>
        <CardDescription>
          As the workspace Owner, promote a teammate to Admin, or move yourself between Owner and Admin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {membersQuery.isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading team…</p>
        ) : members.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const isSelf = m.user_id === user?.id;
              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {m.full_name || "No name"} {isSelf && <span className="text-muted-foreground">(you)</span>}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant={m.role === "owner" ? "outline" : "secondary"} className="text-xs">
                        {m.role === "owner" ? "Owner" : m.role}
                      </Badge>
                      {m.is_platform_admin && (
                        <Badge variant="default" className="text-xs gap-1">
                          <Crown className="h-2.5 w-2.5" />
                          Admin
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {m.is_platform_admin ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={demote.isPending}
                        onClick={() => demote.mutate(m.user_id)}
                      >
                        <ShieldMinus className="h-3 w-3 mr-1" />
                        Move to {isSelf ? "Owner" : "Member"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={promote.isPending}
                        onClick={() => promote.mutate(m.user_id)}
                      >
                        <ShieldPlus className="h-3 w-3 mr-1" />
                        Make Admin
                      </Button>
                    )}
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
