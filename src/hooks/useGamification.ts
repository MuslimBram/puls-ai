import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useInsertMutation } from "@/hooks/useSupabaseQuery";

export const useGamification = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const achievements = useQuery({
    queryKey: ["gamification-achievements", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("gamification_achievements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const progress = useQuery({
    queryKey: ["gamification-progress", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("gamification_progress").select("*").order("total_points", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createAchievement = useInsertMutation<{ title: string; achievement_type: string; points?: number; description?: string }>(
    "gamification_achievements",
    "gamification-achievements",
    "Achievement created",
  );

  return { achievements: achievements.data ?? [], progress: progress.data ?? [], createAchievement, isLoading: achievements.isLoading };
};
