// supabase/functions/_shared/ai-guard-server.ts
// ============================================================
// PULSE AI — SERVER-SIDE DETERMINISTIC AI GUARD ENGINE (PHASE A4)
//
// Shared Deno module for server-side AI Guard evaluation.
// NON-CUSTODIAL: Controls ONLY Pulse-owned automated actions.
// ZERO LLM calls / 0 provider costs / 100% deterministic.
// ============================================================

export type AiGuardActionOutput =
  | "ALLOW"
  | "WARN"
  | "REQUIRE_HUMAN_APPROVAL"
  | "BLOCK_PULSE_AUTOMATION";

export type AiGuardRiskLevel = "low" | "medium" | "high" | "critical";

export interface ServerAdsTelemetryInput {
  workspace_id: string;
  provider: "meta_ads" | "google_ads" | "tiktok_ads";
  ad_account_id: string;
  campaign_id?: string;
  current_spend: number;
  baseline_spend: number;
  spend_velocity?: number;
  current_budget?: number;
  previous_budget?: number;
  campaign_status?: string;
  is_known_account?: boolean;
  is_known_campaign?: boolean;
  auth_anomaly?: boolean;
  token_anomaly?: boolean;
  connection_anomaly?: boolean;
  billing_signal?: "normal" | "failed" | "unsupported";
}

export interface ServerAiGuardEvaluation {
  workspace_id: string;
  provider: "meta_ads" | "google_ads" | "tiktok_ads";
  ad_account_id: string;
  campaign_id?: string;
  risk_score: number;
  risk_level: AiGuardRiskLevel;
  decision: AiGuardActionOutput;
  triggered_rules: string[];
  reasons: string[];
  recommended_action: string;
  evaluated_at: string;
  requires_human_approval: boolean;
  block_automation: boolean;
}

export function evaluateServerAdsRisk(
  telemetry: ServerAdsTelemetryInput,
  maxSpendIncreasePercent = 50,
  maxBudgetIncreasePercent = 30
): ServerAiGuardEvaluation {
  const triggeredRules: string[] = [];
  const reasons: string[] = [];
  let maxRiskScore = 0;

  // 1. Auth/Token Anomaly Check
  if (telemetry.auth_anomaly || telemetry.token_anomaly || telemetry.connection_anomaly) {
    triggeredRules.push("AUTH_TOKEN_COMPROMISE");
    reasons.push("Authentication or channel token anomaly detected on connection.");
    maxRiskScore = Math.max(maxRiskScore, 100);
  }

  // 2. Spend Increase Check
  if (telemetry.baseline_spend > 0) {
    const spendIncreasePercent =
      ((telemetry.current_spend - telemetry.baseline_spend) / telemetry.baseline_spend) * 100;

    if (spendIncreasePercent >= 200 || telemetry.current_spend >= telemetry.baseline_spend * 3) {
      triggeredRules.push("EXTREME_SPEND_SPIKE");
      reasons.push(
        `Extreme spend spike of ${Math.round(spendIncreasePercent)}% exceeds 200% baseline threshold.`
      );
      maxRiskScore = Math.max(maxRiskScore, 85);
    } else if (spendIncreasePercent > maxSpendIncreasePercent) {
      triggeredRules.push("MODERATE_SPEND_MOVEMENT");
      reasons.push(
        `Spend increase of ${Math.round(spendIncreasePercent)}% exceeds threshold (${maxSpendIncreasePercent}%).`
      );
      maxRiskScore = Math.max(maxRiskScore, 45);
    }
  }

  // 3. Budget Increase Check
  if (telemetry.previous_budget && telemetry.current_budget && telemetry.previous_budget > 0) {
    const budgetIncreasePercent =
      ((telemetry.current_budget - telemetry.previous_budget) / telemetry.previous_budget) * 100;

    if (budgetIncreasePercent > maxBudgetIncreasePercent) {
      triggeredRules.push("BUDGET_INCREASE_EXCEEDED");
      reasons.push(
        `Budget increase of ${Math.round(budgetIncreasePercent)}% exceeds threshold (${maxBudgetIncreasePercent}%).`
      );
      maxRiskScore = Math.max(maxRiskScore, 65);
    }
  }

  // 4. Unknown Campaign Check
  if (
    telemetry.is_known_campaign === false &&
    (telemetry.campaign_status === "active" || telemetry.campaign_status === "ACTIVE")
  ) {
    triggeredRules.push("UNKNOWN_CAMPAIGN_ACTIVATION");
    reasons.push("Unrecognized new campaign activation detected.");
    maxRiskScore = Math.max(maxRiskScore, 70);
  }

  // 5. Billing Failure Signal Check
  if (telemetry.billing_signal === "failed") {
    triggeredRules.push("PROVIDER_BILLING_FAILURE");
    reasons.push("Provider reported billing or payment failure signal.");
    maxRiskScore = Math.max(maxRiskScore, 60);
  }

  // Decision mapping
  let decision: AiGuardActionOutput = "ALLOW";
  let riskLevel: AiGuardRiskLevel = "low";
  let recommendedAction = "Proceed with normal automated workflow.";

  if (maxRiskScore >= 80) {
    decision = "BLOCK_PULSE_AUTOMATION";
    riskLevel = "critical";
    recommendedAction = "Block Pulse automated execution immediately and alert workspace administrator.";
  } else if (maxRiskScore >= 60) {
    decision = "REQUIRE_HUMAN_APPROVAL";
    riskLevel = "high";
    recommendedAction = "Pause Pulse automated execution until an authorized workspace human approves.";
  } else if (maxRiskScore >= 40) {
    decision = "WARN";
    riskLevel = "medium";
    recommendedAction = "Log risk warning in audit log.";
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
