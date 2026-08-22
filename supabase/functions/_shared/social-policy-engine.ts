/**
 * social-policy-engine.ts — SOCIAL-1E
 *
 * Canonical policy decision engine.
 * Produces ALLOW / REVIEW / BLOCK for a proposed social/channel interaction.
 *
 * TARGET FLOW:
 *   Engagement
 *   → Identity (SOCIAL-1B)
 *   → Interest Memory (SOCIAL-1C)
 *   → Intent/Journey (SOCIAL-1D)
 *   → Provider Capability (SOCIAL-1E: social-provider-capability.ts)
 *   → Consent / Opt-out / Policy (SOCIAL-1E: social-consent-evaluator.ts)
 *   → ALLOW / REVIEW / BLOCK  ← THIS MODULE
 *
 * STRICT NO-EXECUTION BOUNDARY:
 *   This engine MUST NOT:
 *     - send any message via any channel
 *     - execute NBA (Next Best Action)
 *     - create campaigns, offers, or discounts
 *     - schedule commercial follow-ups
 *     - execute AI-3 controlled actions
 *
 * SAFETY INVARIANTS:
 *   - High intent score NEVER overrides BLOCK from consent/opt-out/provider rules
 *   - anonymous_aggregate is always BLOCK for person-level outbound
 *   - platform_actor is provider-scoped only; cannot be treated as CRM known_person
 *   - cross-workspace consent is always invalid
 *   - revoked consent is always BLOCK
 *   - missing/unverified provider capability → REVIEW or BLOCK (never silently ALLOW)
 *   - NOT_VERIFIED capability → REVIEW
 *   - UNSUPPORTED capability → BLOCK
 *   - disconnected channel → BLOCK
 */

import type { CanonicalIdentityState } from "./identity-graph.ts";
import {
  getProviderCapability,
  type ProviderCapability,
} from "./social-provider-capability.ts";
import {
  evaluateConsent,
  type ConsentRecord,
  type ConsentDb,
} from "./social-consent-evaluator.ts";

// ── Policy Decision ───────────────────────────────────────────────────────────

export type PolicyDecision = "ALLOW" | "REVIEW" | "BLOCK";

// ── Machine-readable reason codes ────────────────────────────────────────────

export type PolicyReasonCode =
  | "POLICY_OK"
  | "PROVIDER_UNSUPPORTED"
  | "CAPABILITY_NOT_VERIFIED"
  | "CAPABILITY_UNSUPPORTED"
  | "CONSENT_MISSING"
  | "OPTED_OUT"
  | "CONSENT_REVOKED"
  | "GLOBALLY_SUPPRESSED"
  | "CHANNEL_SUPPRESSED"
  | "QUIET_HOURS"
  | "CHANNEL_NOT_CONNECTED"
  | "PROVIDER_WINDOW_CLOSED"
  | "TEMPLATE_REQUIRED"
  | "BUSINESS_VERIFICATION_REQUIRED"
  | "RATE_LIMIT_RISK"
  | "IDENTITY_NOT_ELIGIBLE"
  | "ANONYMOUS_AGGREGATE"
  | "PLATFORM_ACTOR_CRM_INELIGIBLE"
  | "CROSS_WORKSPACE_CONSENT"
  | "HUMAN_REVIEW_REQUIRED"
  | "TRANSACTIONAL_ONLY"
  | "UNKNOWN_CONSENT";

// ── Policy Result ─────────────────────────────────────────────────────────────

export interface PolicyResult {
  decision: PolicyDecision;
  reasons: PolicyReasonCode[];
  provider: string;
  channel_type: string;
  identity_state: CanonicalIdentityState;
  workspace_id: string;
  /** True when the capability registry has a confirmed LIVE/BETA entry */
  capability_verified: boolean;
  /** True when consent is confirmed valid (not transactional-only, not revoked) */
  consent_valid: boolean;
  /** High intent score was presented but did NOT override a BLOCK */
  intent_score_presented?: number;
  evaluated_at: string;
}

// ── Policy Input ──────────────────────────────────────────────────────────────

/** Interaction type being evaluated */
export type InteractionType =
  | "outbound_reply"        // reply within a conversation window
  | "proactive_outbound"    // initiate unsolicited outbound
  | "inbound_response"      // responding to inbound
  | "comment"               // commenting on a post/story
  | "reaction";             // reacting to a post/message

export interface PolicyEvaluationInput {
  workspace_id: string;
  provider: string;
  channel_type: string;
  identity_state: CanonicalIdentityState;
  interaction_type: InteractionType;

  /** Contact identifier (email address, phone number, actor ID) for consent lookup */
  contact_identifier: string;

  /** True if the channel connection is confirmed active */
  channel_connected: boolean;

  /** Optional: pre-loaded consent record (skip if not available) */
  consent_record?: ConsentRecord | null;

  /** Optional: SOCIAL-1D intent score (0.0 – 1.0). Does NOT override policy. */
  intent_score?: number;

  /** Optional: workspace of the consent record for cross-workspace check */
  consent_workspace_id?: string;

  /** Optional: current local hour for quiet-hours evaluation (0–23) */
  local_hour?: number;

  /** Optional: workspace quiet-hours config (start_hour, end_hour inclusive block range) */
  quiet_hours?: { start_hour: number; end_hour: number } | null;

  db: ConsentDb;
}

// ── Quiet-hours helper ────────────────────────────────────────────────────────

function isInQuietHours(
  local_hour: number,
  quiet_hours: { start_hour: number; end_hour: number },
): boolean {
  const { start_hour, end_hour } = quiet_hours;
  // Handles both same-day windows (e.g. 22–8) and cross-midnight windows
  if (start_hour <= end_hour) {
    return local_hour >= start_hour && local_hour <= end_hour;
  }
  // Cross-midnight: start=22, end=8 means 22,23,0,1,...,8
  return local_hour >= start_hour || local_hour <= end_hour;
}

// ── Main policy evaluation function ──────────────────────────────────────────

/**
 * Evaluate whether a proposed social/channel interaction is policy-safe.
 *
 * Returns a PolicyResult with ALLOW / REVIEW / BLOCK and machine-readable reasons.
 *
 * This function NEVER sends anything. It only evaluates.
 *
 * Precedence (hard-coded; intent score cannot override any of these):
 *   1. Identity eligibility check (anonymous_aggregate → BLOCK)
 *   2. Channel connected check (disconnected → BLOCK)
 *   3. Provider capability check (UNSUPPORTED → BLOCK; NOT_VERIFIED → REVIEW)
 *   4. Provider-specific restrictions (templates, business_verification, window)
 *   5. Consent / opt-out / suppression check
 *   6. Quiet hours (if applicable and configured)
 *   7. POLICY_OK → ALLOW
 */
export async function evaluatePolicy(
  input: PolicyEvaluationInput,
): Promise<PolicyResult> {
  const {
    workspace_id,
    provider,
    channel_type,
    identity_state,
    interaction_type,
    contact_identifier,
    channel_connected,
    consent_record,
    intent_score,
    consent_workspace_id,
    local_hour,
    quiet_hours,
    db,
  } = input;

  const reasons: PolicyReasonCode[] = [];
  const evaluated_at = new Date().toISOString();

  // ── 1. Identity eligibility ──────────────────────────────────────────────────
  if (identity_state === "anonymous_aggregate") {
    reasons.push("ANONYMOUS_AGGREGATE");
    return result("BLOCK", reasons, input, false, false, evaluated_at, intent_score);
  }

  // platform_actor cannot be used for CRM-level person outbound
  // (it may be used for provider-scoped reply within a window, but that is
  //  a separate check; any person-level CRM operation is ineligible)
  // We flag this as informational — the caller must scope appropriately
  if (identity_state === "platform_actor" && interaction_type === "proactive_outbound") {
    reasons.push("PLATFORM_ACTOR_CRM_INELIGIBLE");
    return result("BLOCK", reasons, input, false, false, evaluated_at, intent_score);
  }

  // ── 2. Channel connected ─────────────────────────────────────────────────────
  if (!channel_connected) {
    reasons.push("CHANNEL_NOT_CONNECTED");
    return result("BLOCK", reasons, input, false, false, evaluated_at, intent_score);
  }

  // ── 3. Provider capability ───────────────────────────────────────────────────
  const capability: ProviderCapability | null = getProviderCapability(provider);

  if (!capability) {
    reasons.push("PROVIDER_UNSUPPORTED");
    return result("BLOCK", reasons, input, false, false, evaluated_at, intent_score);
  }

  // Check the relevant capability for the interaction type
  const relevantCapabilityStatus = resolveCapabilityStatus(capability, interaction_type);

  if (relevantCapabilityStatus === "UNSUPPORTED") {
    reasons.push("CAPABILITY_UNSUPPORTED");
    return result("BLOCK", reasons, input, false, false, evaluated_at, intent_score);
  }

  if (relevantCapabilityStatus === "NOT_VERIFIED") {
    reasons.push("CAPABILITY_NOT_VERIFIED");
    // Fall through to REVIEW below after consent checks
  }

  // ── 4. Provider-specific restrictions ────────────────────────────────────────
  if (capability.business_verification_required) {
    // We cannot verify this at runtime without a live API call;
    // flag for REVIEW if doing proactive outbound
    if (interaction_type === "proactive_outbound") {
      reasons.push("BUSINESS_VERIFICATION_REQUIRED");
    }
  }

  if (capability.human_review_required) {
    reasons.push("HUMAN_REVIEW_REQUIRED");
  }

  // ── 5. Consent / opt-out / suppression ───────────────────────────────────────
  const consentEval = await evaluateConsent({
    workspace_id,
    contact_identifier,
    channel_type,
    identity_state,
    contact_workspace_id: consent_workspace_id,
    consent_record,
    db,
  });

  if (
    consentEval.is_opted_out ||
    consentEval.reasons.includes("OPTED_OUT")
  ) {
    reasons.push("OPTED_OUT");
    return result("BLOCK", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", false, evaluated_at, intent_score);
  }

  if (
    consentEval.is_globally_suppressed ||
    consentEval.reasons.includes("GLOBALLY_SUPPRESSED")
  ) {
    reasons.push("GLOBALLY_SUPPRESSED");
    return result("BLOCK", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", false, evaluated_at, intent_score);
  }

  if (
    consentEval.is_channel_suppressed ||
    consentEval.reasons.includes("CHANNEL_SUPPRESSED")
  ) {
    reasons.push("CHANNEL_SUPPRESSED");
    return result("BLOCK", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", false, evaluated_at, intent_score);
  }

  if (consentEval.reasons.includes("CONSENT_REVOKED")) {
    reasons.push("CONSENT_REVOKED");
    return result("BLOCK", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", false, evaluated_at, intent_score);
  }

  if (consentEval.reasons.includes("ANONYMOUS_AGGREGATE_INELIGIBLE")) {
    reasons.push("ANONYMOUS_AGGREGATE");
    return result("BLOCK", reasons, input, false, false, evaluated_at, intent_score);
  }

  if (consentEval.reasons.includes("CROSS_WORKSPACE_INELIGIBLE")) {
    reasons.push("CROSS_WORKSPACE_CONSENT");
    return result("BLOCK", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", false, evaluated_at, intent_score);
  }

  const consentMissingOrUnknown =
    consentEval.validity === "unknown" ||
    consentEval.reasons.includes("CONSENT_MISSING") ||
    consentEval.reasons.includes("UNKNOWN_CONSENT");

  if (consentMissingOrUnknown) {
    reasons.push("CONSENT_MISSING");
    // Consent missing → REVIEW (not BLOCK, to allow human decision)
    return result("REVIEW", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", false, evaluated_at, intent_score);
  }

  const consentValid = consentEval.validity === "valid" || consentEval.validity === "transactional_only";

  if (consentEval.validity === "transactional_only") {
    reasons.push("TRANSACTIONAL_ONLY");
    // Transactional-only consent during proactive outbound → REVIEW
    if (interaction_type === "proactive_outbound") {
      return result("REVIEW", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", true, evaluated_at, intent_score);
    }
  }

  // ── 6. Quiet hours ───────────────────────────────────────────────────────────
  if (
    capability.quiet_hours_applicable &&
    quiet_hours !== null &&
    quiet_hours !== undefined &&
    local_hour !== undefined
  ) {
    if (isInQuietHours(local_hour, quiet_hours)) {
      reasons.push("QUIET_HOURS");
      return result("BLOCK", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", consentValid, evaluated_at, intent_score);
    }
  }

  // ── Final: if any REVIEW flags remain, return REVIEW ─────────────────────────
  const hasReviewFlag =
    reasons.includes("CAPABILITY_NOT_VERIFIED") ||
    reasons.includes("HUMAN_REVIEW_REQUIRED") ||
    reasons.includes("BUSINESS_VERIFICATION_REQUIRED") ||
    reasons.includes("TRANSACTIONAL_ONLY");

  if (hasReviewFlag) {
    return result("REVIEW", reasons, input, relevantCapabilityStatus !== "NOT_VERIFIED", consentValid, evaluated_at, intent_score);
  }

  // ── ALLOW ────────────────────────────────────────────────────────────────────
  reasons.push("POLICY_OK");
  return result("ALLOW", reasons, input, true, consentValid, evaluated_at, intent_score);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveCapabilityStatus(
  capability: ProviderCapability,
  interaction_type: InteractionType,
): ProviderCapability["inbound_messaging"] {
  switch (interaction_type) {
    case "outbound_reply":
    case "inbound_response":
      return capability.outbound_reply;
    case "proactive_outbound":
      return capability.proactive_outbound;
    case "comment":
      return capability.comments_support;
    case "reaction":
      return capability.reactions_support;
    default:
      return "NOT_VERIFIED";
  }
}

function result(
  decision: PolicyDecision,
  reasons: PolicyReasonCode[],
  input: PolicyEvaluationInput,
  capability_verified: boolean,
  consent_valid: boolean,
  evaluated_at: string,
  intent_score?: number,
): PolicyResult {
  return {
    decision,
    reasons,
    provider: input.provider,
    channel_type: input.channel_type,
    identity_state: input.identity_state,
    workspace_id: input.workspace_id,
    capability_verified,
    consent_valid,
    ...(intent_score !== undefined ? { intent_score_presented: intent_score } : {}),
    evaluated_at,
  };
}
