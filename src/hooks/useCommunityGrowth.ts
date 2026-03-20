import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useCommunityGrowth = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const groups = useQuery({
    queryKey: ["community-groups", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const members = useQuery({
    queryKey: ["community-members", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_members")
        .select("*")
        .order("points", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const analytics = useQuery({
    queryKey: ["community-analytics", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_analytics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createGroup = useMutation({
    mutationFn: async (input: { name: string; description?: string; group_type?: string }) => {
      const { data, error } = await supabase.from("community_groups").insert({
        user_id: user!.id,
        workspace_id: workspace?.id,
        ...input,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Community group created");
      qc.invalidateQueries({ queryKey: ["community-groups"] });
    },
  });

  return { groups: groups.data ?? [], members: members.data ?? [], analytics: analytics.data ?? [], createGroup, isLoading: groups.isLoading };
};
