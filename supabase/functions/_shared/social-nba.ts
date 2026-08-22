/**
 * social-nba.ts — SOCIAL-1F
 *
 * Controlled Social Next-Best-Action adapter/extension.
 *
 * PIPELINE:
 *   Engagement → Identity → Interest Memory → Intent Score → Journey
 *   → Provider / Consent / Policy Gate (SOCIAL-1E)
 *   → Controlled Social NBA (SOCIAL-1F)
 *
 * STRICT BOUNDARIES:
 *   MUST NOT send messages, execute commercial actions, create campaigns,
 *   book appointments, or invoke AI-3 execution.
 *
 *   SOCIAL-1E policy result is a HARD gate:
 *     BLOCK  → recommendation_status = "blocked"       (no actionable NBA)
 *     REVIEW → recommendation_status = "review_required" + human_approval_required = true
 *     ALLOW  → recommendation_status = "recommended"   (eligible for later controlled execution)
 *
 *   ALLOW does NOT trigger execution; execution belongs to the downstream
 *   Controlled Actions / AI-3 layer.
 *
 * DETERMINISTIC SAFETY GATES (applied before AI reasoning):
 *   1. anonymous_aggregate          → do_nothing
 *   2. policy BLOCK                 → blocked
 *   3. policy REVIEW                → review_required + human approval
 *   4. insufficient evidence        → do_nothing
 *   5. ambiguous / non-person       → do_nothing for commercial actions
 *   6. unverified commercial config → downgrade to do_nothing / safe fallback
 *   7. duplicate active NBA         → idempotent; no new recommendation emitted
 */

import type { PolicyDecision, PolicyResult } from "./social-policy-engine.ts";
import type { JourneyPhase } from "./social-intent-journey.ts";
import type { IntentScoreBand } from "./social-intent-score.ts";
import type { CanonicalIdentityState } from "./identity-graph.ts";

// ── Action Types ─────────────────────────────────────────────────────────────

/**
 * Canonical Social NBA action vocabulary.
 * Reuses existing taxonomy; no commercial terms are invented here.
 */
export type SocialNbaActionType =
  | "follow_up"
  | "personalized_offer"
  | "cross_sell"
  | "upsell"
  | "referral_invitation"
  | "booking_follow_up"
  | "human_handoff"
  | "do_nothing";

// ── Recommendation Status ─────────────────────────────────────────────────────

export type RecommendationStatus =
  | "recommended"       // eligible for later controlled execution; NOT yet executed
  | "review_required"   // human must approve before any execution
  | "blocked"           // policy BLOCK — no outbound eligible
  | "do_nothing";       // deterministic safe fallback (anonymous, weak evidence, etc.)

// ── Reason Codes ──────────────────────────────────────────────────────────────

export type NbaReasonCode =
  | "POLICY_BLOCK"
  | "POLICY_REVIEW"
  | "POLICY_ALLOW"
  | "POLICY_CONTEXT_MISMATCH"
  | "ANONYMOUS_AGGREGATE"
  | "INSUFFICIENT_EVIDENCE"
  | "AMBIGUOUS_IDENTITY"
  | "NON_PERSON_IDENTITY"
  | "MISSING_COMMERCIAL_CONFIG"
  | "BUSINESS_RULES_NOT_ELIGIBLE"
  | "HUMAN_HANDOFF_ONLY"
  | "DUPLICATE_ACTIVE_NBA"
  | "IDEMPOTENT_RETRY"
  | "INTENT_NONE_OR_LOW"
  | "SAFE_FALLBACK"
  | "NBA_GENERATED";

// ── Social Confidence Band ────────────────────────────────────────────────────

/**
 * SOCIAL-1F categorical confidence band.
 *
 * This is a SOCIAL-only field and MUST NOT overwrite the canonical
 * next_best_actions.confidence column, which is numeric 0.0–1.0.
 * It is persisted in the separate social_confidence_band column.
 */
export type SocialConfidenceBand = "low" | "medium" | "high";

/**
 * Deterministic, documented mapping from SOCIAL categorical confidence band
 * to canonical numeric confidence (0.0–1.0).
 *
 * low    → 0.25  (weak signal; insufficient evidence or unverified config)
 * medium → 0.55  (moderate signal; some evidence, single journey phase)
 * high   → 0.80  (strong signal; multiple consistent evidence points)
 *
 * These thresholds are intentionally conservative and fixed.
 * They must not be changed without a documented contract revision.
 */
export const SOCIAL_CONFIDENCE_BAND_TO_NUMERIC: Record<SocialConfidenceBand, number> = {
  low: 0.25,
  medium: 0.55,
  high: 0.80,
} as const;

// ── Social NBA Result ─────────────────────────────────────────────────────────

/**
 * Typed canonical Social NBA result.
 *
 * This is the SOCIAL-1F recommendation contract.
 * It MUST NOT be treated as an execution order.
 */
export interface SocialNbaResult {
  /** Workspace this recommendation belongs to. */
  workspace_id: string;

  /** Canonical resolved identity key (from SOCIAL-1B). */
  resolved_identity_key: string;

  /** Set only when identity_state === 'known_person'. */
  canonical_person_id?: string;

  /** Social provider (e.g. meta_ig, email). */
  provider: string;

  /** Channel type (e.g. instagram, email). */
  channel: string;

  /** Intent score at recommendation time (0.0000 – 1.0000). */
  intent_score: number;

  /** Intent band at recommendation time. */
  intent_score_band: IntentScoreBand;

  /** Identity state at recommendation time. */
  identity_state: CanonicalIdentityState;

  /** Journey phase at recommendation time. */
  journey_phase: JourneyPhase | null;

  /** SOCIAL-1E policy decision (authoritative). */
  policy_decision: PolicyDecision;

  /** Recommended action type. */
  action_type: SocialNbaActionType;

  /** Recommendation status. */
  recommendation_status: RecommendationStatus;

  /**
   * True when human approval is required before any downstream execution.
   * Always true for review_required and blocked statuses.
   * May be true for recommended when the action type warrants caution.
   */
  human_approval_required: boolean;

  /** Reason codes explaining the recommendation. */
  reason_codes: NbaReasonCode[];

  /**
   * Policy reasons from SOCIAL-1E evaluation.
   * Preserved so later execution can prove why the action was recommended.
   */
  policy_reasons: string[];

  /** ISO timestamp when SOCIAL-1E policy was evaluated. */
  policy_evaluated_at: string;

  /** Evidence IDs that contributed to the intent score (from SOCIAL-1D). */
  evidence_refs: string[];

  /**
   * Canonical numeric confidence in the recommendation (0.0–1.0).
   *
   * Derived deterministically from social_confidence_band using
   * SOCIAL_CONFIDENCE_BAND_TO_NUMERIC. This value is persisted into the
   * canonical next_best_actions.confidence column (NUMERIC type).
   *
   * MUST be >= 0 and <= 1. Never a text value.
   */
  confidence: number;

  /**
   * SOCIAL-only categorical confidence band (low | medium | high).
   *
   * Stored in the separate social_confidence_band column so the canonical
   * next_best_actions.confidence (numeric 0–1) is never overloaded with
   * a text value.
   */
  social_confidence_band: SocialConfidenceBand;

  /**
   * Idempotency key — prevents duplicate active recommendations for the same
   * workspace + identity + source evidence + recommendation window.
   */
  idempotency_key: string;

  /** ISO timestamp when this recommendation was generated. */
  recommended_at: string;
}

// ── NBA Input Contract ────────────────────────────────────────────────────────

export interface BusinessConfig {
  /**
   * Configured offer IDs for this workspace.
   * Absence means no personalized_offer / cross_sell / upsell is eligible.
   */
  configured_offer_ids?: string[];

  /**
   * Whether a referral program is active for this workspace.
   */
  referral_program_active?: boolean;

  /**
   * Whether booking / demo follow-up is configured.
   */
  booking_followup_configured?: boolean;
}

export interface SocialNbaInput {
  workspace_id: string;
  resolved_identity_key: string;
  canonical_person_id?: string;
  identity_state: CanonicalIdentityState;

  /** Provider (e.g. meta_ig, email) */
  provider: string;

  /** Channel type */
  channel: string;

  /** Bounded 0.0000 – 1.0000 */
  intent_score: number;
  intent_score_band: IntentScoreBand;

  /** Journey phase; null if not yet established */
  journey_phase: JourneyPhase | null;

  /**
   * Authoritative SOCIAL-1E policy result.
   * The NBA engine will not re-evaluate policy — it consumes this result as truth.
   */
  policy_result: PolicyResult;

  /**
   * Evidence IDs that contributed to the intent score.
   * Used in evidence_refs and idempotency_key derivation.
   */
  evidence_refs: string[];

  /**
   * Stable logical recommendation window (e.g. `2026-08-22`, `2026-W34`, or
   * event-batch key). Retries for the same logical recommendation MUST pass the
   * same value, even across midnight boundaries.
   */
  recommendation_window: string;

  /** Business configuration for this workspace. */
  business_config?: BusinessConfig;

  /**
   * If a matching idempotency key already has an active recommendation,
   * pass it here so the engine can short-circuit (idempotent retry).
   */
  existing_active_idempotency_key?: string;
}

// ── Idempotency Key ───────────────────────────────────────────────────────────

/**
 * Derive a deterministic idempotency key from stable inputs.
 *
 * The key covers: workspace + identity + sorted evidence refs + current UTC date.
 * Same evidence on the same calendar day always yields the same key, preventing
 * NBA spam from repeated pipeline runs over the same social events.
 */
export function deriveIdempotencyKey(
  workspace_id: string,
  resolved_identity_key: string,
  evidence_refs: string[],
  recommendation_window: string,
): string {
  const evSorted = [...evidence_refs].sort().join(",");
  const window = recommendation_window.trim();
  return `social_nba:${workspace_id}:${resolved_identity_key}:${evSorted}:${window}`;
}

function policyContextMatches(input: SocialNbaInput): boolean {
  return input.policy_result.workspace_id === input.workspace_id &&
    input.policy_result.provider === input.provider &&
    input.policy_result.channel_type === input.channel &&
    input.policy_result.identity_state === input.identity_state;
}

// ── Deterministic Action Selection ────────────────────────────────────────────

/**
 * Select the safest eligible NBA action type based on deterministic gates.
 *
 * Rules (in order):
 *   1. human_handoff explicitly triggered → human_handoff
 *   2. intent none/low + no journey context → do_nothing
 *   3. personalized_offer / cross_sell / upsell require configured offers
 *   4. referral_invitation requires active referral program
 *   5. booking_follow_up requires booking config
 *   6. follow_up is the safe fallback for any known_person with moderate+ intent
 *   7. Otherwise → do_nothing
 *
 * AI MAY assist downstream with recommendation text, but must not override
 * the action type chosen here or invent business facts.
 */
function selectActionType(input: SocialNbaInput): SocialNbaActionType {
  const { identity_state, intent_score, intent_score_band, journey_phase, business_config } = input;

  // Non-person identities cannot receive commercial NBA.
  if (identity_state !== "known_person") {
    return "do_nothing";
  }

  // Very low intent — not enough signal.
  if (intent_score_band === "none") {
    return "do_nothing";
  }

  // Active customers + high intent + configured offer → upsell (checked before personalized_offer
  // to differentiate: upsell targets existing actives at peak intent)
  if (
    journey_phase === "active" &&
    intent_score_band === "high" &&
    business_config?.configured_offer_ids &&
    business_config.configured_offer_ids.length > 0
  ) {
    return "upsell";
  }

  // Converting journey + strong/high intent + configured offer → personalized_offer
  if (
    journey_phase === "converting" &&
    (intent_score_band === "strong" || intent_score_band === "high") &&
    business_config?.configured_offer_ids &&
    business_config.configured_offer_ids.length > 0
  ) {
    return "personalized_offer";
  }

  // Champion + referral program → referral_invitation
  if (
    journey_phase === "champion" &&
    business_config?.referral_program_active === true &&
    intent_score_band !== "none" && intent_score_band !== "low"
  ) {
    return "referral_invitation";
  }

  // Converting + booking configured → booking_follow_up
  if (
    journey_phase === "converting" &&
    business_config?.booking_followup_configured === true
  ) {
    return "booking_follow_up";
  }

  // At-risk or dormant → human review / handoff is safer
  if (journey_phase === "at_risk" || journey_phase === "dormant") {
    return "human_handoff";
  }

  // Moderate+ intent with known_person → safe follow_up
  if (
    (intent_score_band === "moderate" || intent_score_band === "strong" || intent_score_band === "high") &&
    intent_score > 0
  ) {
    return "follow_up";
  }

  return "do_nothing";
}

// ── Human Approval Gate ───────────────────────────────────────────────────────

function requiresHumanApproval(
  status: RecommendationStatus,
  action_type: SocialNbaActionType,
  policy_result: PolicyResult,
): boolean {
  if (status === "blocked" || status === "review_required" || status === "do_nothing") {
    return true;
  }
  // human_handoff always requires human
  if (action_type === "human_handoff") return true;
  // Policy REVIEW flag present even on ALLOW (belt-and-suspenders)
  if (policy_result.reasons.includes("HUMAN_REVIEW_REQUIRED")) return true;
  // Unverified capability
  if (!policy_result.capability_verified) return true;
  return false;
}

// ── Confidence Propagation ────────────────────────────────────────────────────

/**
 * Derive canonical numeric confidence and social confidence band from intent
 * band, action type, and business config.
 *
 * Commercial actions with missing business config are downgraded to "low"
 * (0.25) regardless of the upstream intent band.
 *
 * Numeric confidence is derived deterministically from the band using
 * SOCIAL_CONFIDENCE_BAND_TO_NUMERIC. The caller must store numeric confidence
 * into next_best_actions.confidence and the band into social_confidence_band.
 */
function deriveConfidence(
  intent_confidence: SocialConfidenceBand,
  action_type: SocialNbaActionType,
  business_config?: BusinessConfig,
): { confidence: number; social_confidence_band: SocialConfidenceBand } {
  // Commercial actions with missing config downgrade to low
  const band: SocialConfidenceBand = (
    (action_type === "personalized_offer" || action_type === "upsell" || action_type === "cross_sell") &&
    (!business_config?.configured_offer_ids || business_config.configured_offer_ids.length === 0)
  ) ? "low" : intent_confidence;

  return {
    confidence: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC[band],
    social_confidence_band: band,
  };
}

// ── Main NBA Function ─────────────────────────────────────────────────────────

/**
 * Generate a Controlled Social NBA recommendation.
 *
 * This function MUST NOT:
 *   - send any provider message
 *   - create campaigns
 *   - execute AI-3 actions
 *   - invent business facts (offers, discounts, prices, promo codes)
 *
 * The returned SocialNbaResult is a RECOMMENDATION ONLY.
 * Execution belongs to the downstream Controlled Actions layer.
 */
export function generateSocialNba(
  input: SocialNbaInput,
  intentConfidence: SocialConfidenceBand = "low",
): SocialNbaResult {
  const {
    workspace_id,
    resolved_identity_key,
    canonical_person_id,
    identity_state,
    provider,
    channel,
    intent_score,
    intent_score_band,
    journey_phase,
    policy_result,
    evidence_refs,
    recommendation_window,
    business_config,
    existing_active_idempotency_key,
  } = input;

  const recommended_at = new Date().toISOString();
  const idempotency_key = deriveIdempotencyKey(
    workspace_id,
    resolved_identity_key,
    evidence_refs,
    recommendation_window,
  );

  // ── Gate -1: Policy context must match this NBA input ──────────────────────
  if (!policyContextMatches(input)) {
    return {
      workspace_id,
      resolved_identity_key,
      canonical_person_id,
      provider,
      channel,
      intent_score,
      intent_score_band,
      identity_state,
      journey_phase,
      policy_decision: policy_result.decision,
      action_type: "do_nothing",
      recommendation_status: "blocked",
      human_approval_required: true,
      reason_codes: ["POLICY_CONTEXT_MISMATCH", "SAFE_FALLBACK"],
      policy_reasons: [...new Set([...policy_result.reasons, "POLICY_CONTEXT_MISMATCH"])],
      policy_evaluated_at: policy_result.evaluated_at,
      evidence_refs,
      confidence: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low,
      social_confidence_band: "low" as const,
      idempotency_key,
      recommended_at,
    };
  }

  // ── Gate 0: Idempotent retry ───────────────────────────────────────────────
  if (
    existing_active_idempotency_key &&
    existing_active_idempotency_key === idempotency_key
  ) {
    return {
      workspace_id,
      resolved_identity_key,
      canonical_person_id,
      provider,
      channel,
      intent_score,
      intent_score_band,
      identity_state,
      journey_phase,
      policy_decision: policy_result.decision,
      action_type: "do_nothing",
      recommendation_status: "do_nothing",
      human_approval_required: true,
      reason_codes: ["DUPLICATE_ACTIVE_NBA", "IDEMPOTENT_RETRY"],
      policy_reasons: policy_result.reasons as string[],
      policy_evaluated_at: policy_result.evaluated_at,
      evidence_refs,
      confidence: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low,
      social_confidence_band: "low" as const,
      idempotency_key,
      recommended_at,
    };
  }

  // ── Gate 1: Anonymous aggregate ────────────────────────────────────────────
  if (identity_state === "anonymous_aggregate") {
    return {
      workspace_id,
      resolved_identity_key,
      canonical_person_id,
      provider,
      channel,
      intent_score,
      intent_score_band,
      identity_state,
      journey_phase,
      policy_decision: policy_result.decision,
      action_type: "do_nothing",
      recommendation_status: "do_nothing",
      human_approval_required: true,
      reason_codes: ["ANONYMOUS_AGGREGATE"],
      policy_reasons: policy_result.reasons as string[],
      policy_evaluated_at: policy_result.evaluated_at,
      evidence_refs,
      confidence: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low,
      social_confidence_band: "low" as const,
      idempotency_key,
      recommended_at,
    };
  }

  // ── Gate 2: Policy BLOCK ───────────────────────────────────────────────────
  if (policy_result.decision === "BLOCK") {
    return {
      workspace_id,
      resolved_identity_key,
      canonical_person_id,
      provider,
      channel,
      intent_score,
      intent_score_band,
      identity_state,
      journey_phase,
      policy_decision: "BLOCK",
      action_type: "do_nothing",
      recommendation_status: "blocked",
      human_approval_required: true,
      reason_codes: ["POLICY_BLOCK"],
      policy_reasons: policy_result.reasons as string[],
      policy_evaluated_at: policy_result.evaluated_at,
      evidence_refs,
      confidence: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low,
      social_confidence_band: "low" as const,
      idempotency_key,
      recommended_at,
    };
  }

  // ── Gate 3: Insufficient evidence ─────────────────────────────────────────
  if (evidence_refs.length === 0) {
    const status: RecommendationStatus =
      policy_result.decision === "REVIEW" ? "review_required" : "do_nothing";
    return {
      workspace_id,
      resolved_identity_key,
      canonical_person_id,
      provider,
      channel,
      intent_score,
      intent_score_band,
      identity_state,
      journey_phase,
      policy_decision: policy_result.decision,
      action_type: "do_nothing",
      recommendation_status: status,
      human_approval_required: true,
      reason_codes: ["INSUFFICIENT_EVIDENCE"],
      policy_reasons: policy_result.reasons as string[],
      policy_evaluated_at: policy_result.evaluated_at,
      evidence_refs,
      confidence: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low,
      social_confidence_band: "low" as const,
      idempotency_key,
      recommended_at,
    };
  }

  // ── Gate 4: Policy REVIEW ─────────────────────────────────────────────────
  // Recommendation may be generated but must be marked human-review-required.
  if (policy_result.decision === "REVIEW") {
    const action_type = selectActionType(input);
    const { confidence, social_confidence_band } = deriveConfidence(intentConfidence, action_type, business_config);
    return {
      workspace_id,
      resolved_identity_key,
      canonical_person_id,
      provider,
      channel,
      intent_score,
      intent_score_band,
      identity_state,
      journey_phase,
      policy_decision: "REVIEW",
      action_type,
      recommendation_status: "review_required",
      human_approval_required: true,
      reason_codes: ["POLICY_REVIEW", "NBA_GENERATED"],
      policy_reasons: policy_result.reasons as string[],
      policy_evaluated_at: policy_result.evaluated_at,
      evidence_refs,
      confidence,
      social_confidence_band,
      idempotency_key,
      recommended_at,
    };
  }

  // ── Gate 5: ALLOW path — deterministic action selection ───────────────────
  const action_type = selectActionType(input);

  // do_nothing → emit do_nothing status (not a recommendation)
  if (action_type === "do_nothing") {
    return {
      workspace_id,
      resolved_identity_key,
      canonical_person_id,
      provider,
      channel,
      intent_score,
      intent_score_band,
      identity_state,
      journey_phase,
      policy_decision: "ALLOW",
      action_type: "do_nothing",
      recommendation_status: "do_nothing",
      human_approval_required: true,
      reason_codes: ["SAFE_FALLBACK"],
      policy_reasons: policy_result.reasons as string[],
      policy_evaluated_at: policy_result.evaluated_at,
      evidence_refs,
      confidence: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low,
      social_confidence_band: "low" as const,
      idempotency_key,
      recommended_at,
    };
  }

  const reason_codes: NbaReasonCode[] = ["POLICY_ALLOW", "NBA_GENERATED"];
  const { confidence, social_confidence_band } = deriveConfidence(intentConfidence, action_type, business_config);
  const human_approval_required = requiresHumanApproval("recommended", action_type, policy_result);

  return {
    workspace_id,
    resolved_identity_key,
    canonical_person_id,
    provider,
    channel,
    intent_score,
    intent_score_band,
    identity_state,
    journey_phase,
    policy_decision: "ALLOW",
    action_type,
    recommendation_status: "recommended",
    human_approval_required,
    reason_codes,
    policy_reasons: policy_result.reasons as string[],
    policy_evaluated_at: policy_result.evaluated_at,
    evidence_refs,
    confidence,
    social_confidence_band,
    idempotency_key,
    recommended_at,
  };
}

export interface CanonicalNbaDbClient {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
}

export interface PersistSocialNbaParams {
  recommendation: SocialNbaResult;
  lead_id?: string | null;
}

export interface PersistSocialNbaResult {
  status: "inserted" | "duplicate_active" | "error";
  nba_id: string | null;
  recommendation: SocialNbaResult;
  rule_allows: boolean;
  rule_id: string | null;
}

function applyBusinessRuleGuard(
  recommendation: SocialNbaResult,
  ruleAllows: boolean,
): SocialNbaResult {
  if (ruleAllows) return recommendation;
  if (recommendation.recommendation_status !== "recommended") return recommendation;

  return {
    ...recommendation,
    action_type: "do_nothing",
    recommendation_status: "do_nothing",
    human_approval_required: true,
    confidence: SOCIAL_CONFIDENCE_BAND_TO_NUMERIC.low,
    social_confidence_band: "low" as const,
    reason_codes: [...new Set([...recommendation.reason_codes, "BUSINESS_RULES_NOT_ELIGIBLE", "SAFE_FALLBACK"])],
  };
}

/**
 * Persist Social NBA via canonical NBA storage path (`next_best_actions`) only.
 * This adapter reuses canonical business-rule authority and canonical persistence.
 */
export async function persistSocialNbaRecommendation(
  db: CanonicalNbaDbClient,
  params: PersistSocialNbaParams,
): Promise<PersistSocialNbaResult> {
  const { recommendation, lead_id = null } = params;

  const { data: ruleCheck, error: ruleError } = await db.rpc("validate_nba_against_rules", {
    p_workspace_id: recommendation.workspace_id,
    p_action_type: recommendation.action_type,
    p_offer_value: 0,
    p_offer_unit: "pct",
    p_lead_id: lead_id,
  });

  if (ruleError) {
    return {
      status: "error",
      nba_id: null,
      recommendation,
      rule_allows: false,
      rule_id: null,
    };
  }

  const ruleAllows = (ruleCheck as any)?.allowed === true;
  const guardedRecommendation = applyBusinessRuleGuard(recommendation, ruleAllows);

  const { data, error } = await db.rpc("upsert_social_nba_next_best_action", {
    p_workspace_id: guardedRecommendation.workspace_id,
    p_lead_id: lead_id,
    p_action_type: guardedRecommendation.action_type,
    p_reason: guardedRecommendation.reason_codes.join(","),
    p_confidence: guardedRecommendation.confidence,
    p_social_confidence_band: guardedRecommendation.social_confidence_band,
    p_priority: guardedRecommendation.recommendation_status === "recommended" ? 6 : 1,
    p_suggested_channel: guardedRecommendation.channel,
    p_offer_value: null,
    p_offer_unit: null,
    p_expires_at: null,
    p_rule_id: (ruleCheck as any)?.rule_id ?? null,
    p_rule_allows: ruleAllows,
    p_status: guardedRecommendation.recommendation_status,
    p_policy_decision: guardedRecommendation.policy_decision,
    p_policy_reasons: guardedRecommendation.policy_reasons,
    p_policy_evaluated_at: guardedRecommendation.policy_evaluated_at,
    p_human_approval_required: guardedRecommendation.human_approval_required,
    p_provider: guardedRecommendation.provider,
    p_channel: guardedRecommendation.channel,
    p_identity_state: guardedRecommendation.identity_state,
    p_resolved_identity_key: guardedRecommendation.resolved_identity_key,
    p_canonical_person_id: guardedRecommendation.canonical_person_id ?? null,
    p_intent_score: guardedRecommendation.intent_score,
    p_intent_score_band: guardedRecommendation.intent_score_band,
    p_journey_phase: guardedRecommendation.journey_phase,
    p_evidence_refs: guardedRecommendation.evidence_refs,
    p_recommendation_status: guardedRecommendation.recommendation_status,
    p_reason_codes: guardedRecommendation.reason_codes,
    p_idempotency_key: guardedRecommendation.idempotency_key,
    p_recommended_at: guardedRecommendation.recommended_at,
  });

  if (error) {
    return {
      status: "error",
      nba_id: null,
      recommendation: guardedRecommendation,
      rule_allows: ruleAllows,
      rule_id: (ruleCheck as any)?.rule_id ?? null,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const wasInserted = Boolean(row?.inserted);
  return {
    status: wasInserted ? "inserted" : "duplicate_active",
    nba_id: row?.id ?? null,
    recommendation: guardedRecommendation,
    rule_allows: ruleAllows,
    rule_id: (ruleCheck as any)?.rule_id ?? null,
  };
}
