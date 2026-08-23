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
  // Keep the legacy step key so existing stored onboarding progress remains compatible.
  // The product-facing label now reflects the CRM capability that is actually implemented.
  { key: "import_contacts", label: "Add First CRM Deal", description: "Create your first deal in the CRM pipeline" },
  // Keep the legacy step key for stored onboarding progress compatibility.
  // The Knowledge Base supports both website ingestion and document upload, so the label must not imply documents only.
  { key: "upload_knowledge", label: "Add Knowledge Source", description: "Add a website or document to your AI knowledge base" },
  { key: "create_automation", label: "Create First Automation", description: "Set up an automated workflow" },
];

export const useOnboardingProgress = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();

  // Stored completions
  const stored = useQuery({
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

  // Live signals — auto-detect completion from real data
  const signals = useQuery({
    queryKey: ["onboarding-signals", user?.id],
    queryFn: async () => {
      const [profile, channels, deals, knowledge, automations] = await Promise.all([
        supabase.from("business_profiles").select("id").eq("user_id", user!.id).limit(1),
        supabase.from("channels").select("id").eq("user_id", user!.id).eq("connection_status", "connected").limit(1),
        supabase.from("deals").select("id").eq("user_id", user!.id).limit(1),
        supabase.from("knowledge_sources").select("id").eq("user_id", user!.id).limit(1),
        supabase.from("automation_workflows").select("id").eq("user_id", user!.id).limit(1),
      ]);
      return {
        business_profile: (profile.data ?? []).length > 0,
        connect_channel: (channels.data ?? []).length > 0,
        import_contacts: (deals.data ?? []).length > 0,
        upload_knowledge: (knowledge.data ?? []).length > 0,
        create_automation: (automations.data ?? []).length > 0,
      } as Record<string, boolean>;
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const storedKeys = new Set((stored.data || []).filter((s: any) => s.completed_at).map((s: any) => s.step_key));
  const live = signals.data || {};

  const steps: OnboardingStep[] = ONBOARDING_STEPS.map((s) => ({
    ...s,
    completed: storedKeys.has(s.key) || !!live[s.key],
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

  return { steps, completionPct, isComplete, completeStep, isLoading: stored.isLoading || signals.isLoading };
};
