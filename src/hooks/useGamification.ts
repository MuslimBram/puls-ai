import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const useGamification = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

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

  const createAchievement = useMutation({
    mutationFn: async (input: { title: string; achievement_type: string; points?: number; description?: string }) => {
      const { data, error } = await supabase.from("gamification_achievements").insert({
        user_id: user!.id,
        workspace_id: workspace?.id,
        ...input,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Achievement created");
      qc.invalidateQueries({ queryKey: ["gamification-achievements"] });
    },
  });

  return { achievements: achievements.data ?? [], progress: progress.data ?? [], createAchievement, isLoading: achievements.isLoading };
};
