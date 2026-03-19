import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/use-toast";

export interface CompetitiveSignal {
  id: string;
  user_id: string;
  signal_type: string;
  title: string;
  description: string | null;
  competitor_id: string | null;
  severity: string;
  is_read: boolean;
  is_actioned: boolean;
  metadata: Record<string, unknown>;
  detected_at: string;
  created_at: string;
}

export interface CompetitiveAction {
  id: string;
  signal_id: string | null;
  action_text: string;
  action_type: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export const useCompetitiveSignals = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["competitive-signals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitive_signals")
        .select("*")
        .eq("user_id", user!.id)
        .order("detected_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as CompetitiveSignal[];
    },
    enabled: !!user,
  });
};

export const useCompetitiveActions = (signalId?: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["competitive-actions", user?.id, signalId],
    queryFn: async () => {
      let q = supabase
        .from("competitive_actions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (signalId) q = q.eq("signal_id", signalId);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return (data || []) as unknown as CompetitiveAction[];
    },
    enabled: !!user,
  });
};

export const useMarkSignalRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("competitive_signals").update({ is_read: true } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitive-signals"] }),
  });
};

export const useToggleCompetitiveAction = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("competitive_actions")
        .update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitive-actions"] });
      toast({ title: "Action updated" });
    },
  });
};

export const useCreateCompetitiveAction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { signal_id?: string; action_text: string; action_type?: string }) => {
      const { error } = await supabase.from("competitive_actions").insert({
        ...data,
        user_id: user!.id,
        workspace_id: workspace?.id || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitive-actions"] });
      toast({ title: "Action created" });
    },
  });
};

export const useCompetitiveStats = () => {
  const { data: signals } = useCompetitiveSignals();
  const { data: actions } = useCompetitiveActions();

  const totalSignals = signals?.length ?? 0;
  const unreadSignals = signals?.filter((s) => !s.is_read).length ?? 0;
  const totalActions = actions?.length ?? 0;
  const completedActions = actions?.filter((a) => a.is_completed).length ?? 0;
  const adoptionRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

  return { totalSignals, unreadSignals, totalActions, completedActions, adoptionRate };
};
