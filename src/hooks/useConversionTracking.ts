import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ConversionEvent =
  | "plan_page_view"
  | "upgrade_click"
  | "paywall_trigger"
  | "trial_started"
  | "trial_to_paid"
  | "downgrade_click"
  | "downgrade_reason"
  | "referral_click"
  | "referral_conversion"
  | "feature_adoption"
  | "workspace_expansion"
  | "activation_milestone"
  | "churn_recovery"
  | "insight_view"
  | "suggestion_accepted";

export const useConversionTracking = () => {
  const { user } = useAuth();

  const track = useCallback(
    async (event: ConversionEvent, metadata?: Record<string, unknown>) => {
      if (!user) return;
      try {
        await supabase.from("audit_logs").insert({
          actor_id: user.id,
          action: `conversion.${event}`,
          target_type: "conversion",
          metadata: metadata ?? {},
        } as any);
      } catch {
        // silent — analytics should never block UX
      }
    },
    [user],
  );

  return { track };
};
