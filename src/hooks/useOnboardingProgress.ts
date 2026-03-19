import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  completed: boolean;
}

const ONBOARDING_STEPS = [
  { key: "business_profile", label: "Create Business Profile", description: "Set up your business name, industry, and description" },
  { key: "connect_channel", label: "Connect First Channel", description: "Connect WhatsApp, Telegram, or another messaging channel" },
  { key: "import_contacts", label: "Import Contacts", description: "Add your first contacts to the CRM" },
  { key: "upload_knowledge", label: "Upload Knowledge Base", description: "Train AI with your business documents" },
  { key: "create_automation", label: "Create First Automation", description: "Set up an automated workflow" },
];

export const useOnboardingProgress = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["onboarding-progress", user?.id, workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_progress")
        .select("*")
        .eq("user_id", user!.id)
        .eq("workspace_id", workspace!.id);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user && !!workspace,
  });

  const completedKeys = new Set((query.data || []).filter((s: any) => s.completed_at).map((s: any) => s.step_key));

  const steps: OnboardingStep[] = ONBOARDING_STEPS.map((s) => ({
    ...s,
    completed: completedKeys.has(s.key),
  }));

  const completionPct = steps.length > 0 ? Math.round((steps.filter((s) => s.completed).length / steps.length) * 100) : 0;

  const completeStep = useMutation({
    mutationFn: async (stepKey: string) => {
      const { error } = await supabase.from("onboarding_progress").upsert({
        user_id: user!.id,
        workspace_id: workspace!.id,
        step_key: stepKey,
        completed_at: new Date().toISOString(),
      } as any, { onConflict: "user_id,workspace_id,step_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
  });

  const isComplete = completionPct === 100;

  return { steps, completionPct, isComplete, completeStep, isLoading: query.isLoading };
};
