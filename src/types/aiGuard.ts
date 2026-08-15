/**
 * PULSE AI — AI GUARD RISK CONTRACT (PHASE A2 SPECIFICATION)
 *
 * Non-custodial risk contract definition for automated ads & account safety.
 * Pulse AI monitors spend velocity, campaign anomalies, and authentication signals.
 *
 * IMPORTANT PRODUCT RULE:
 * - Pulse AI is NOT an ad wallet or payment processor.
 * - BLOCK_PULSE_AUTOMATION prevents Pulse from executing automated changes.
 * - Pulse NEVER freezes client bank cards or acts as the ad network payer.
 */

export type AiGuardSignalType =
  | "abnormal_spend_spike"
  | "spend_velocity_anomaly"
  | "unusual_campaign_activation"
  | "unexpected_budget_change"
  | "unusual_activity"
  | "suspicious_billing_signal"
  | "repeated_failed_auth"
  | "token_connectivity_anomaly"
  | "rule_violation";

export type AiGuardRiskLevel = "low" | "medium" | "high" | "critical";

export type AiGuardActionOutput =
  | "ALLOW"
  | "WARN"
  | "REQUIRE_HUMAN_APPROVAL"
  | "BLOCK_PULSE_AUTOMATION";

export interface AiGuardRiskSignal {
  id: string;
  workspace_id: string;
  provider: "meta_ads" | "google_ads" | "tiktok_ads";
  campaign_id?: string;
  signal_type: AiGuardSignalType;
  risk_level: AiGuardRiskLevel;
  action_recommended: AiGuardActionOutput;
  details: string;
  detected_at: string;
}

export interface AiGuardAssessmentResult {
  workspace_id: string;
  provider: "meta_ads" | "google_ads" | "tiktok_ads";
  status: AiGuardActionOutput;
  risk_score: number; // 0 (safe) to 100 (critical risk)
  signals: AiGuardRiskSignal[];
  requires_human_approval: boolean;
  block_automation: boolean;
  evaluated_at: string;
}
