import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface AgentShift {
  id: string;
  workspace_id: string;
  user_id: string;
  agent_user_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: "scheduled" | "active" | "completed" | "absent";
  notes: string | null;
  created_at: string;
}

export const useWorkforce = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const shiftsQuery = useQuery({
    queryKey: ["agent-shifts", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_shifts")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AgentShift[];
    },
    enabled: !!workspace,
  });

  const createShift = useMutation({
    mutationFn: async (params: {
      agentUserId: string;
      shiftDate: string;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      notes?: string;
    }) => {
      const { error } = await supabase.from("agent_shifts").insert({
        workspace_id: workspace!.id,
        user_id: user!.id,
        agent_user_id: params.agentUserId,
        shift_date: params.shiftDate,
        start_time: params.startTime,
        end_time: params.endTime,
        break_minutes: params.breakMinutes || 0,
        notes: params.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-shifts"] });
      toast.success("Shift created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateShift = useMutation({
    mutationFn: async (params: { id: string; status?: string; notes?: string }) => {
      const update: any = { updated_at: new Date().toISOString() };
      if (params.status) update.status = params.status;
      if (params.notes !== undefined) update.notes = params.notes;
      const { error } = await supabase.from("agent_shifts").update(update).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-shifts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteShift = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-shifts"] });
      toast.success("Shift removed");
    },
  });

  return {
    shifts: shiftsQuery.data ?? [],
    isLoading: shiftsQuery.isLoading,
    createShift,
    updateShift,
    deleteShift,
  };
};
