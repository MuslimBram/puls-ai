/**
 * PULSE AI — ADS RISK EVENT & AUTOMATION GATE ENGINE (PHASE A3)
 *
 * Connects Normalized Ads Telemetry -> AI Guard -> Human Approval Adapter -> Automation Gate.
 * NON-CUSTODIAL:
 * - Controls ONLY Pulse-owned automated actions.
 * - DOES NOT send payment/blocking requests to Meta/Google.
 * - DOES NOT freeze campaign billing or move money.
 */

import { evaluateAdsRisk } from "../aiGuard/aiGuardEngine";
import {
  AiGuardEvaluation,
  HumanApprovalRequestPayload,
  WorkspaceAdsThresholds,
} from "../../types/aiGuard";
import { NormalizedAdsTelemetry } from "./adsTelemetryNormalizer";

export interface AdsRiskEvent {
  id: string;
  workspace_id: string;
  provider: "meta_ads" | "google_ads" | "tiktok_ads";
  ad_account_id: string;
  campaign_id?: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  decision: "ALLOW" | "WARN" | "REQUIRE_HUMAN_APPROVAL" | "BLOCK_PULSE_AUTOMATION";
  triggered_rules: string[];
  reasons: string[];
  recommended_action: string;
  telemetry_snapshot: Omit<NormalizedAdsTelemetry, "workspace_id" | "ad_account_id">;
  created_at: string;
  approval_required: boolean;
  approval_reference: string | null;
}

export interface AutomationExecutionResult {
  executed: boolean;
  decision: string;
  reason: string;
  result?: unknown;
}

/**
 * Processes normalized telemetry through AI Guard and creates a sanitized AdsRiskEvent.
 */
export function createAdsRiskEvent(
  telemetry: NormalizedAdsTelemetry,
  thresholds?: Partial<WorkspaceAdsThresholds>
): AdsRiskEvent {
  const evaluation: AiGuardEvaluation = evaluateAdsRisk(telemetry, thresholds);
  const eventId = `evt-${telemetry.workspace_id}-${Date.now()}`;

  let approvalRef: string | null = null;
  if (evaluation.requires_human_approval) {
    approvalRef = `appr-${telemetry.workspace_id}-${Date.now()}`;
  }

  // Sanitized snapshot (Zero tokens, zero credentials, zero payment data)
  const { workspace_id: _ws, ad_account_id: _acc, ...snapshot } = telemetry;

  return {
    id: eventId,
    workspace_id: telemetry.workspace_id,
    provider: telemetry.provider,
    ad_account_id: telemetry.ad_account_id,
    campaign_id: telemetry.campaign_id,
    risk_score: evaluation.risk_score,
    risk_level: evaluation.risk_level,
    decision: evaluation.decision,
    triggered_rules: evaluation.triggered_rules,
    reasons: evaluation.reasons,
    recommended_action: evaluation.recommended_action,
    telemetry_snapshot: snapshot,
    created_at: evaluation.evaluated_at,
    approval_required: evaluation.requires_human_approval,
    approval_reference: approvalRef,
  };
}

/**
 * Human Approval Adapter: Creates standard Pulse Human Approval payload for REQUIRE_HUMAN_APPROVAL events.
 */
export function adaptToExistingHumanApproval(event: AdsRiskEvent): HumanApprovalRequestPayload {
  return {
    request_id: event.approval_reference ?? `req-${event.id}`,
    workspace_id: event.workspace_id,
    title: `Ads Risk Review: ${event.provider.toUpperCase()} (${event.ad_account_id})`,
    description: `Risk Score: ${event.risk_score} (${event.risk_level.toUpperCase()}). Reasons: ${event.reasons.join(" ")}`,
    source: "AI_GUARD",
    risk_score: event.risk_score,
    triggered_rules: event.triggered_rules,
    reasons: event.reasons,
    status: "pending_review",
    created_at: event.created_at,
  };
}

/**
 * Pulse Brain Adapter: Sanitizes risk context for Pulse Brain decision engine context without calling ai-router.
 */
export function adaptToPulseBrainContext(event: AdsRiskEvent): Record<string, unknown> {
  return {
    provider: event.provider,
    ad_account_id: event.ad_account_id,
    risk_score: event.risk_score,
    risk_level: event.risk_level,
    decision: event.decision,
    reasons: event.reasons,
    recommended_action: event.recommended_action,
    requires_human_approval: event.approval_required,
    block_automation: event.decision === "BLOCK_PULSE_AUTOMATION",
  };
}

/**
 * Enforcement Gate: Prevents Pulse-owned automated actions from executing if decision is BLOCK_PULSE_AUTOMATION or REQUIRE_HUMAN_APPROVAL.
 * DOES NOT send payment/blocking instructions to Meta or Google.
 */
export async function enforcePulseAutomationGate(
  event: AdsRiskEvent,
  pulseActionFn: () => Promise<unknown>
): Promise<AutomationExecutionResult> {
  if (event.decision === "BLOCK_PULSE_AUTOMATION") {
    return {
      executed: false,
      decision: event.decision,
      reason: `Blocked by AI Guard: ${event.reasons.join(" ")}`,
    };
  }

  if (event.decision === "REQUIRE_HUMAN_APPROVAL") {
    return {
      executed: false,
      decision: event.decision,
      reason: `Paused by AI Guard: Requires Human Approval (${event.approval_reference})`,
    };
  }

  // Decision is ALLOW or WARN -> Execute Pulse mock automated action
  const result = await pulseActionFn();
  return {
    executed: true,
    decision: event.decision,
    reason: event.decision === "WARN" ? `Executed with warnings: ${event.reasons.join(" ")}` : "Executed cleanly",
    result,
  };
}
