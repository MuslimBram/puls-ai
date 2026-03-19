import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface AutonomousTask {
  id: string;
  task_type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  ai_confidence: number;
  source_signal: string | null;
  action_payload: any;
  created_at: string;
}

export interface AutomationSuggestion {
  id: string;
  suggestion_type: string;
  title: string;
  description: string | null;
  confidence: number;
  status: string;
  trigger_config: any;
  action_config: any;
  created_at: string;
}

export interface OperationalSignal {
  id: string;
  signal_type: string;
  title: string;
  description: string | null;
  severity: string;
  is_read: boolean;
  created_at: string;
}

export const useAutonomousTasks = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["autonomous-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("autonomous_tasks")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as AutonomousTask[];
    },
    enabled: !!user,
  });
};

export const useRespondToTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, action }: { taskId: string; action: "accept" | "dismiss" }) => {
      const update = action === "accept"
        ? { status: "accepted", accepted_at: new Date().toISOString() }
        : { status: "dismissed", dismissed_at: new Date().toISOString() };
      const { error } = await supabase
        .from("autonomous_tasks")
        .update(update as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autonomous-tasks"] });
      toast.success("Task updated");
    },
  });
};

export const useAutomationSuggestions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["automation-suggestions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_suggestions")
        .select("*")
        .eq("user_id", user!.id)
        .eq("status", "pending")
        .order("confidence", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as AutomationSuggestion[];
    },
    enabled: !!user,
  });
};

export const useAdoptSuggestion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from("automation_suggestions")
        .update({ status: "adopted", adopted_at: new Date().toISOString() } as any)
        .eq("id", suggestionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-suggestions"] });
      toast.success("Automation adopted");
    },
  });
};

export const useOperationalSignals = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["operational-signals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operational_intelligence_log")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as OperationalSignal[];
    },
    enabled: !!user,
  });
};

export const useOpsAnalytics = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ops-analytics", user?.id],
    queryFn: async () => {
      const { data: tasks } = await supabase
        .from("autonomous_tasks")
        .select("status")
        .eq("user_id", user!.id);

      const total = (tasks || []).length;
      const accepted = (tasks || []).filter((t: any) => t.status === "accepted").length;
      const completed = (tasks || []).filter((t: any) => t.status === "completed").length;
      const dismissed = (tasks || []).filter((t: any) => t.status === "dismissed").length;

      return {
        totalSuggestions: total,
        adoptionRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
        completionRate: accepted > 0 ? Math.round((completed / accepted) * 100) : 0,
        dismissRate: total > 0 ? Math.round((dismissed / total) * 100) : 0,
      };
    },
    enabled: !!user,
  });
};
