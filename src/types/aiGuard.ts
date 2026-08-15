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

export interface WorkspaceAdsThresholds {
  workspace_id: string;
  max_spend_increase_percent: number; // e.g. 50 (%)
  max_budget_increase_percent: number; // e.g. 30 (%)
  max_spend_velocity: number; // e.g. 500 currency units / day
  require_approval_for_budget_change: boolean;
  require_approval_for_new_campaign: boolean;
}

export interface AiGuardTelemetryInput {
  workspace_id: string;
  provider: "meta_ads" | "google_ads" | "tiktok_ads";
  ad_account_id: string;
  campaign_id?: string;
  current_spend: number;
  baseline_spend: number;
  spend_velocity?: number; // spend per day or hour
  current_budget?: number;
  previous_budget?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  campaign_status?: string;
  previous_campaign_status?: string;
  is_known_account?: boolean;
  is_known_campaign?: boolean;
  auth_anomaly?: boolean;
  token_anomaly?: boolean;
  connection_anomaly?: boolean;
  billing_signal?: "normal" | "failed" | "unsupported";
}

export interface AiGuardEvaluation {
  workspace_id: string;
  provider: "meta_ads" | "google_ads" | "tiktok_ads";
  ad_account_id: string;
  campaign_id?: string;
  risk_score: number; // 0 (safe) to 100 (critical risk)
  risk_level: AiGuardRiskLevel;
  decision: AiGuardActionOutput;
  triggered_rules: string[];
  reasons: string[];
  recommended_action: string;
  evaluated_at: string;
  requires_human_approval: boolean;
  block_automation: boolean;
}

export interface HumanApprovalRequestPayload {
  request_id: string;
  workspace_id: string;
  title: string;
  description: string;
  source: "AI_GUARD";
  risk_score: number;
  triggered_rules: string[];
  reasons: string[];
  status: "pending_review";
  created_at: string;
}
