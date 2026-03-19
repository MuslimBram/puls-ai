import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export const usePersonalizationEngine = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const uid = user?.id;
  const wid = workspace?.id;

  const profiles = useQuery({
    queryKey: ["personalization-profiles", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personalization_profiles")
        .select("*")
        .eq("user_id", uid!)
        .order("engagement_score", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const rules = useQuery({
    queryKey: ["personalization-rules", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personalization_rules")
        .select("*")
        .eq("user_id", uid!)
        .order("priority", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const analytics = useQuery({
    queryKey: ["personalization-analytics", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personalization_analytics")
        .select("*")
        .eq("user_id", uid!)
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
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
