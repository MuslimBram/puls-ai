import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { useUserQuery } from "@/hooks/useSupabaseQuery";

export const usePersonalizationEngine = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const uid = user?.id;
  const wid = workspace?.id;

  const profiles = useUserQuery("personalization_profiles", "personalization-profiles", {
    orderBy: "engagement_score",
    limit: 100,
  });

  const rules = useUserQuery("personalization_rules", "personalization-rules", {
    orderBy: "priority",
  });

  const analytics = useUserQuery("personalization_analytics", "personalization-analytics", {
    orderBy: "metric_date",
    limit: 30,
  });

  const generateProfiles = useMutation({
    mutationFn: async () => {
      const sampleProfiles = [
        { contact_identifier: "high-value-segment", contact_name: "Premium Customers", segment: "high_value", preferred_channel: "email", preferred_timing: "morning", engagement_score: 92, browsing_patterns: [{ pattern: "pricing_pages", frequency: "high" }], campaign_interactions: [{ campaign: "premium_offer", response: "clicked" }], conversation_topics: [{ topic: "enterprise_features" }], purchase_signals: [{ signal: "upgrade_intent", strength: 0.85 }] },
        { contact_identifier: "trial-converters", contact_name: "Trial Users", segment: "trial", preferred_channel: "chat", preferred_timing: "afternoon", engagement_score: 67, browsing_patterns: [{ pattern: "feature_docs", frequency: "medium" }], campaign_interactions: [{ campaign: "onboarding_drip", response: "opened" }], conversation_topics: [{ topic: "setup_help" }], purchase_signals: [{ signal: "activation_progress", strength: 0.6 }] },
        { contact_identifier: "at-risk-segment", contact_name: "Declining Engagement", segment: "at_risk", preferred_channel: "phone", preferred_timing: "late_morning", engagement_score: 28, browsing_patterns: [{ pattern: "cancel_page", frequency: "low" }], campaign_interactions: [{ campaign: "retention_offer", response: "ignored" }], conversation_topics: [{ topic: "billing_concerns" }], purchase_signals: [{ signal: "churn_risk", strength: 0.75 }] },
      ];
      const rows = sampleProfiles.map((p) => ({ ...p, user_id: uid!, workspace_id: wid }));
      const { error } = await supabase.from("personalization_profiles").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Personalization profiles generated"); qc.invalidateQueries({ queryKey: ["personalization-profiles"] }); },
  });

  const createRule = useMutation({
    mutationFn: async (rule: { rule_name: string; rule_type: string; conditions: any; actions: any }) => {
      const { error } = await supabase.from("personalization_rules").insert({ ...rule, user_id: uid!, workspace_id: wid } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rule created"); qc.invalidateQueries({ queryKey: ["personalization-rules"] }); },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("personalization_rules").update({ is_active } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personalization-rules"] }); },
  });

  return { profiles, rules, analytics, generateProfiles, createRule, toggleRule };
};
