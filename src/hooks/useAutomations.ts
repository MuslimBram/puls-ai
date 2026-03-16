import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

export interface AutomationAction {
  id: string;
  type: string;
  config: Record<string, unknown>;
  delay_minutes?: number;
}

export interface AutomationWorkflow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: AutomationAction[];
  conditions: Record<string, unknown>;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  workflow_id: string;
  trigger_event: string | null;
  actions_executed: unknown[];
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const TRIGGER_TYPES = [
  { value: "new_lead", label: "New Lead Detected", icon: "Target" },
  { value: "pipeline_stage_change", label: "Pipeline Stage Changed", icon: "ArrowRight" },
  { value: "new_message", label: "New Inbox Message", icon: "MessageSquare" },
  { value: "campaign_response", label: "Campaign Response", icon: "Megaphone" },
  { value: "inactivity", label: "Contact Inactivity", icon: "Clock" },
  { value: "chatbot_completed", label: "Chatbot Flow Completed", icon: "Bot" },
];

export const ACTION_TYPES = [
  { value: "send_message", label: "Send Follow-up Message", icon: "Send" },
  { value: "assign_owner", label: "Assign Owner", icon: "UserPlus" },
  { value: "move_pipeline", label: "Move Pipeline Stage", icon: "ArrowRight" },
  { value: "create_task", label: "Create Task", icon: "CheckSquare" },
  { value: "notify_email", label: "Notify via Email", icon: "Mail" },
  { value: "notify_internal", label: "Internal Alert", icon: "Bell" },
  { value: "call_webhook", label: "Call Webhook", icon: "Globe" },
  { value: "update_tags", label: "Update Tags", icon: "Tag" },
];

export const useAutomationWorkflows = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["automation-workflows", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_workflows")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AutomationWorkflow[];
    },
    enabled: !!user,
  });

  const createWorkflow = useMutation({
    mutationFn: async (workflow: Partial<AutomationWorkflow>) => {
      const { data, error } = await supabase
        .from("automation_workflows")
        .insert({ ...workflow, user_id: user!.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AutomationWorkflow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-workflows"] });
      toast.success("Workflow created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateWorkflow = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutomationWorkflow> & { id: string }) => {
      const { error } = await supabase
        .from("automation_workflows")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-workflows"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteWorkflow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_workflows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-workflows"] });
      toast.success("Workflow deleted");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("automation_workflows")
        .update({ is_active, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-workflows"] });
      toast.success("Workflow updated");
    },
  });

  return {
    workflows: query.data ?? [],
    isLoading: query.isLoading,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    toggleActive,
  };
};

export const useAutomationLogs = (workflowId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["automation-logs", user?.id, workflowId],
    queryFn: async () => {
      let q = supabase
        .from("automation_logs")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (workflowId) q = q.eq("workflow_id", workflowId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AutomationLog[];
    },
    enabled: !!user,
  });
};
