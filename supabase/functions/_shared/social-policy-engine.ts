/**
 * social-policy-engine.ts — SOCIAL-1E
 *
 * Canonical policy decision engine.
 * Produces ALLOW / REVIEW / BLOCK for a proposed social/channel interaction.
 *
 * STRICT NO-EXECUTION BOUNDARY:
 *   MUST NOT send messages, execute NBA, create campaigns, or execute AI-3 actions.
 *
 * SAFETY INVARIANTS:
 *   - High intent score NEVER overrides BLOCK
 *   - anonymous_aggregate is always BLOCK
 *   - platform_actor proactive outbound is always BLOCK
 *   - cross-workspace consent is always invalid
 *   - revoked consent is always BLOCK
 *   - NOT_VERIFIED → REVIEW; UNSUPPORTED → BLOCK; disconnected → BLOCK
 */

import type { CanonicalIdentityState } from "./identity-graph.ts";
import { getProviderCapability, type ProviderCapability } from "./social-provider-capability.ts";
import { evaluateConsent, type ConsentRecord, type ConsentDb } from "./social-consent-evaluator.ts";

export type PolicyDecision = "ALLOW" | "REVIEW" | "BLOCK";

export type PolicyReasonCode =
  | "POLICY_OK" | "PROVIDER_UNSUPPORTED" | "CAPABILITY_NOT_VERIFIED" | "CAPABILITY_UNSUPPORTED"
  | "CONSENT_MISSING" | "OPTED_OUT" | "CONSENT_REVOKED" | "GLOBALLY_SUPPRESSED"
  | "CHANNEL_SUPPRESSED" | "QUIET_HOURS" | "CHANNEL_NOT_CONNECTED" | "PROVIDER_WINDOW_CLOSED"
  | "TEMPLATE_REQUIRED" | "BUSINESS_VERIFICATION_REQUIRED" | "RATE_LIMIT_RISK"
  | "IDENTITY_NOT_ELIGIBLE" | "ANONYMOUS_AGGREGATE" | "PLATFORM_ACTOR_CRM_INELIGIBLE"
  | "CROSS_WORKSPACE_CONSENT" | "HUMAN_REVIEW_REQUIRED" | "TRANSACTIONAL_ONLY" | "UNKNOWN_CONSENT";

export interface PolicyResult {
  decision: PolicyDecision;
  reasons: PolicyReasonCode[];
  provider: string;
  channel_type: string;
  identity_state: CanonicalIdentityState;
  workspace_id: string;
  capability_verified: boolean;
  consent_valid: boolean;
  intent_score_presented?: number;
  evaluated_at: string;
}

export type InteractionType = "outbound_reply" | "proactive_outbound" | "inbound_response" | "comment" | "reaction";

export interface PolicyEvaluationInput {
  workspace_id: string;
  provider: string;
  channel_type: string;
  identity_state: CanonicalIdentityState;
  interaction_type: InteractionType;
  contact_identifier: string;
  channel_connected: boolean;
  consent_record?: ConsentRecord | null;
  intent_score?: number;
  consent_workspace_id?: string;
  local_hour?: number;
  quiet_hours?: { start_hour: number; end_hour: number } | null;
  db: ConsentDb;
}

function isInQuietHours(local_hour: number, qh: { start_hour: number; end_hour: number }): boolean {
  if (qh.start_hour <= qh.end_hour) return local_hour >= qh.start_hour && local_hour <= qh.end_hour;
  return local_hour >= qh.start_hour || local_hour <= qh.end_hour;
}

function resolveCapabilityStatus(cap: ProviderCapability, interaction_type: InteractionType): ProviderCapability["inbound_messaging"] {
  switch (interaction_type) {
    case "outbound_reply": case "inbound_response": return cap.outbound_reply;
    case "proactive_outbound": return cap.proactive_outbound;
    case "comment": return cap.comments_support;
    case "reaction": return cap.reactions_support;
    default: return "NOT_VERIFIED";
  }
}

function buildResult(decision: PolicyDecision, reasons: PolicyReasonCode[], input: PolicyEvaluationInput, capability_verified: boolean, consent_valid: boolean, evaluated_at: string, intent_score?: number): PolicyResult {
  return { decision, reasons, provider: input.provider, channel_type: input.channel_type, identity_state: input.identity_state, workspace_id: input.workspace_id, capability_verified, consent_valid, ...(intent_score !== undefined ? { intent_score_presented: intent_score } : {}), evaluated_at };
}

export async function evaluatePolicy(input: PolicyEvaluationInput): Promise<PolicyResult> {
  const { workspace_id, provider, channel_type, identity_state, interaction_type, contact_identifier, channel_connected, consent_record, intent_score, consent_workspace_id, local_hour, quiet_hours, db } = input;
  const reasons: PolicyReasonCode[] = [];
  const evaluated_at = new Date().toISOString();

  if (identity_state === "anonymous_aggregate") { reasons.push("ANONYMOUS_AGGREGATE"); return buildResult("BLOCK", reasons, input, false, false, evaluated_at, intent_score); }
  if (identity_state === "platform_actor" && interaction_type === "proactive_outbound") { reasons.push("PLATFORM_ACTOR_CRM_INELIGIBLE"); return buildResult("BLOCK", reasons, input, false, false, evaluated_at, intent_score); }
  if (!channel_connected) { reasons.push("CHANNEL_NOT_CONNECTED"); return buildResult("BLOCK", reasons, input, false, false, evaluated_at, intent_score); }

  const capability = getProviderCapability(provider);
  if (!capability) { reasons.push("PROVIDER_UNSUPPORTED"); return buildResult("BLOCK", reasons, input, false, false, evaluated_at, intent_score); }

  const capStatus = resolveCapabilityStatus(capability, interaction_type);
  if (capStatus === "UNSUPPORTED") { reasons.push("CAPABILITY_UNSUPPORTED"); return buildResult("BLOCK", reasons, input, false, false, evaluated_at, intent_score); }
  if (capStatus === "NOT_VERIFIED") reasons.push("CAPABILITY_NOT_VERIFIED");

  if (capability.business_verification_required && interaction_type === "proactive_outbound") reasons.push("BUSINESS_VERIFICATION_REQUIRED");
  if (capability.human_review_required) reasons.push("HUMAN_REVIEW_REQUIRED");

  const consentEval = await evaluateConsent({ workspace_id, contact_identifier, channel_type, identity_state, contact_workspace_id: consent_workspace_id, consent_record, db });
  const capVerified = capStatus !== "NOT_VERIFIED";

  if (consentEval.is_opted_out || consentEval.reasons.includes("OPTED_OUT")) { reasons.push("OPTED_OUT"); return buildResult("BLOCK", reasons, input, capVerified, false, evaluated_at, intent_score); }
  if (consentEval.is_globally_suppressed || consentEval.reasons.includes("GLOBALLY_SUPPRESSED")) { reasons.push("GLOBALLY_SUPPRESSED"); return buildResult("BLOCK", reasons, input, capVerified, false, evaluated_at, intent_score); }
  if (consentEval.is_channel_suppressed || consentEval.reasons.includes("CHANNEL_SUPPRESSED")) { reasons.push("CHANNEL_SUPPRESSED"); return buildResult("BLOCK", reasons, input, capVerified, false, evaluated_at, intent_score); }
  if (consentEval.reasons.includes("CONSENT_REVOKED")) { reasons.push("CONSENT_REVOKED"); return buildResult("BLOCK", reasons, input, capVerified, false, evaluated_at, intent_score); }
  if (consentEval.reasons.includes("ANONYMOUS_AGGREGATE_INELIGIBLE")) { reasons.push("ANONYMOUS_AGGREGATE"); return buildResult("BLOCK", reasons, input, false, false, evaluated_at, intent_score); }
  if (consentEval.reasons.includes("CROSS_WORKSPACE_INELIGIBLE")) { reasons.push("CROSS_WORKSPACE_CONSENT"); return buildResult("BLOCK", reasons, input, capVerified, false, evaluated_at, intent_score); }

  if (consentEval.validity === "unknown" || consentEval.reasons.includes("CONSENT_MISSING") || consentEval.reasons.includes("UNKNOWN_CONSENT")) {
    reasons.push("CONSENT_MISSING"); return buildResult("REVIEW", reasons, input, capVerified, false, evaluated_at, intent_score);
  }

  const consentValid = consentEval.validity === "valid" || consentEval.validity === "transactional_only";

  if (consentEval.validity === "transactional_only") {
    reasons.push("TRANSACTIONAL_ONLY");
    if (interaction_type === "proactive_outbound") return buildResult("REVIEW", reasons, input, capVerified, true, evaluated_at, intent_score);
  }

  if (capability.quiet_hours_applicable && quiet_hours != null && local_hour !== undefined && isInQuietHours(local_hour, quiet_hours)) {
    reasons.push("QUIET_HOURS"); return buildResult("BLOCK", reasons, input, capVerified, consentValid, evaluated_at, intent_score);
  }

  const hasReviewFlag = reasons.includes("CAPABILITY_NOT_VERIFIED") || reasons.includes("HUMAN_REVIEW_REQUIRED") || reasons.includes("BUSINESS_VERIFICATION_REQUIRED") || reasons.includes("TRANSACTIONAL_ONLY");
  if (hasReviewFlag) return buildResult("REVIEW", reasons, input, capVerified, consentValid, evaluated_at, intent_score);

  reasons.push("POLICY_OK");
  return buildResult("ALLOW", reasons, input, true, consentValid, evaluated_at, intent_score);
}
