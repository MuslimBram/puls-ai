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
        await (supabase as any).rpc("record_client_audit_event", {
          _action: `conversion.${event}`,
          _target_type: "conversion",
          _target_id: null,
          _metadata: metadata ?? {},
        });
      } catch {
        // silent — analytics should never block UX
      }
    },
    [user],
  );

  return { track };
};
