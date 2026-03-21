import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInsertMutation } from "@/hooks/useSupabaseQuery";

export const useCommunityGrowth = () => {
  const { user } = useAuth();

  const groups = useQuery({
    queryKey: ["community-groups"],
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
    queryKey: ["community-members"],
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
    queryKey: ["community-analytics"],
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

  const createGroup = useInsertMutation<{ name: string; description?: string; group_type?: string }>(
    "community_groups",
    "community-groups",
    "Community group created",
  );

  return { groups: groups.data ?? [], members: members.data ?? [], analytics: analytics.data ?? [], createGroup, isLoading: groups.isLoading };
};
