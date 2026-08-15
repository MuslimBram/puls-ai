/**
 * PULSE AI — AI GUARD DETERMINISTIC SECURITY & RISK ENGINE (PHASE A2)
 *
 * Pure, deterministic risk evaluator for workspace ad telemetry and account security.
 * 0 LLM/API provider calls, 0 network requests, 0 random values.
 * Same telemetry input + workspace thresholds -> Same deterministic decision.
 *
 * IMPORTANT PRODUCT RULE:
 * - Pulse AI is NON-CUSTODIAL.
 * - BLOCK_PULSE_AUTOMATION stops Pulse automated actions only.
 * - NEVER freezes client bank/cards or acts as payment processor.
 */

import {
  AiGuardActionOutput,
  AiGuardEvaluation,
  AiGuardRiskLevel,
  AiGuardTelemetryInput,
  HumanApprovalRequestPayload,
  WorkspaceAdsThresholds,
} from "../../types/aiGuard";

export const DEFAULT_WORKSPACE_THRESHOLDS: Omit<WorkspaceAdsThresholds, "workspace_id"> = {
  max_spend_increase_percent: 50,
  max_budget_increase_percent: 30,
  max_spend_velocity: 500,
  require_approval_for_budget_change: true,
  require_approval_for_new_campaign: true,
};

/**
 * Pure deterministic risk evaluator.
 * Evaluates normalized ad telemetry against workspace-scoped safety rules.
 */
export function evaluateAdsRisk(
  telemetry: AiGuardTelemetryInput,
  customThresholds?: Partial<WorkspaceAdsThresholds>
): AiGuardEvaluation {
  const thresholds: WorkspaceAdsThresholds = {
    workspace_id: telemetry.workspace_id,
    ...DEFAULT_WORKSPACE_THRESHOLDS,
    ...customThresholds,
  };

  const triggeredRules: string[] = [];
  const reasons: string[] = [];
  let maxRiskScore = 0;

  // Rule 1: Auth or Token Compromise / Anomaly
  if (telemetry.auth_anomaly || telemetry.token_anomaly || telemetry.connection_anomaly) {
    triggeredRules.push("AUTH_TOKEN_COMPROMISE");
    reasons.push("Authentication or channel token anomaly detected on connection.");
    maxRiskScore = Math.max(maxRiskScore, 100);
  }

  // Rule 2: Extreme Spend Spike (> 200% increase or > 3x baseline)
  if (telemetry.baseline_spend > 0) {
    const spendIncreasePercent =
      ((telemetry.current_spend - telemetry.baseline_spend) / telemetry.baseline_spend) * 100;

    if (spendIncreasePercent >= 200 || telemetry.current_spend >= telemetry.baseline_spend * 3) {
      triggeredRules.push("EXTREME_SPEND_SPIKE");
      reasons.push(
        `Extreme spend spike of ${Math.round(spendIncreasePercent)}% exceeds 200% baseline threshold.`
      );
      maxRiskScore = Math.max(maxRiskScore, 85);
    } else if (spendIncreasePercent > thresholds.max_spend_increase_percent) {
      triggeredRules.push("MODERATE_SPEND_MOVEMENT");
      reasons.push(
        `Spend increase of ${Math.round(spendIncreasePercent)}% exceeds workspace threshold (${thresholds.max_spend_increase_percent}%).`
      );
      maxRiskScore = Math.max(maxRiskScore, 45);
    }
  }

  // Rule 3: Budget Increase Anomaly
  if (
    telemetry.previous_budget &&
    telemetry.current_budget &&
    telemetry.previous_budget > 0
  ) {
    const budgetIncreasePercent =
      ((telemetry.current_budget - telemetry.previous_budget) / telemetry.previous_budget) * 100;

    if (budgetIncreasePercent > thresholds.max_budget_increase_percent) {
      triggeredRules.push("BUDGET_INCREASE_EXCEEDED");
      reasons.push(
        `Budget increase of ${Math.round(budgetIncreasePercent)}% exceeds maximum allowed threshold (${thresholds.max_budget_increase_percent}%).`
      );
      maxRiskScore = Math.max(maxRiskScore, 65);
    }
  }

  // Rule 4: Unknown / Unexpected New Campaign Activation
  if (
    telemetry.is_known_campaign === false &&
    (telemetry.campaign_status === "active" || telemetry.campaign_status === "ACTIVE")
  ) {
    triggeredRules.push("UNKNOWN_CAMPAIGN_ACTIVATION");
    reasons.push("Unrecognized new campaign activation detected.");
    maxRiskScore = Math.max(maxRiskScore, 70);
  }

  // Rule 5: Provider Billing/Payment Failure Signal (Evaluated ONLY IF explicitly exposed by provider)
  if (telemetry.billing_signal === "failed") {
    triggeredRules.push("PROVIDER_BILLING_FAILURE");
    reasons.push("Provider reported billing or payment failure signal for account.");
    maxRiskScore = Math.max(maxRiskScore, 60);
  }

  // Determine final decision & risk level deterministically
  let decision: AiGuardActionOutput = "ALLOW";
  let riskLevel: AiGuardRiskLevel = "low";
  let recommendedAction = "Proceed with normal automated workflow.";

  if (maxRiskScore >= 80) {
    decision = "BLOCK_PULSE_AUTOMATION";
    riskLevel = "critical";
    recommendedAction =
      "Block Pulse automated execution immediately and alert workspace administrator.";
  } else if (maxRiskScore >= 60) {
    decision = "REQUIRE_HUMAN_APPROVAL";
    riskLevel = "high";
    recommendedAction =
      "Pause Pulse automated execution until an authorized workspace human approves.";
  } else if (maxRiskScore >= 40) {
    decision = "WARN";
    riskLevel = "medium";
    recommendedAction =
      "Log risk warning in audit dashboard and notify workspace manager.";
  }

  if (reasons.length === 0) {
    reasons.push("Telemetry within normal workspace safety parameters.");
  }

  return {
    workspace_id: telemetry.workspace_id,
    provider: telemetry.provider,
    ad_account_id: telemetry.ad_account_id,
    campaign_id: telemetry.campaign_id,
    risk_score: maxRiskScore,
    risk_level: riskLevel,
    decision,
    triggered_rules: triggeredRules,
    reasons,
    recommended_action: recommendedAction,
    evaluated_at: new Date().toISOString(),
    requires_human_approval: decision === "REQUIRE_HUMAN_APPROVAL",
    block_automation: decision === "BLOCK_PULSE_AUTOMATION",
  };
}

/**
 * Creates human approval payload for integration with existing Pulse Human Approval architecture.
 */
export function createHumanApprovalPayload(
  evaluation: AiGuardEvaluation
): HumanApprovalRequestPayload {
  return {
    request_id: `req-${evaluation.workspace_id}-${Date.now()}`,
    workspace_id: evaluation.workspace_id,
    title: `AI Guard Risk Review: ${evaluation.provider} (${evaluation.ad_account_id})`,
    description: evaluation.reasons.join(" "),
    source: "AI_GUARD",
    risk_score: evaluation.risk_score,
    triggered_rules: evaluation.triggered_rules,
    reasons: evaluation.reasons,
    status: "pending_review",
    created_at: evaluation.evaluated_at,
  };
}

/**
 * Formats risk context for Pulse Brain decision engine consumption.
 */
export function formatPulseBrainRiskContext(evaluation: AiGuardEvaluation): Record<string, unknown> {
  return {
    ai_guard_decision: evaluation.decision,
    ai_guard_risk_score: evaluation.risk_score,
    ai_guard_risk_level: evaluation.risk_level,
    ai_guard_triggered_rules: evaluation.triggered_rules,
    ai_guard_reasons: evaluation.reasons,
    ai_guard_requires_human_approval: evaluation.requires_human_approval,
    ai_guard_block_automation: evaluation.block_automation,
  };
}
