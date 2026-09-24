import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export type WorkspaceMemberRole = "owner" | "admin" | "member" | string;

export const useWorkspaceMembership = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const query = useQuery({
    queryKey: ["workspace-membership", user?.id, workspace?.id],
    queryFn: async () => {
      if (!user?.id || !workspace?.id) return null;

      const { data, error } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return (data?.role ?? null) as WorkspaceMemberRole | null;
    },
    enabled: !!user?.id && !!workspace?.id,
    staleTime: 30_000,
  });

  const role = query.data ?? null;
  const canWrite = role === "owner" || role === "admin" || role === "member";

  return {
    role,
    isMember: !!role,
    canWrite,
    isLoading: query.isLoading,
  };
};
