/**
 * social-intent-score.ts — SOCIAL-1D
 *
 * Canonical workspace-scoped Social Intent Score contract.
 *
 * DESIGN CONTRACT:
 *   - deterministic: same evidence always produces the same score
 *   - bounded: 0.0000 – 1.0000
 *   - explainable: every score carries its evidence contributions
 *   - workspace-scoped: score is strictly per-workspace
 *   - recomputable: scores can be recomputed from canonical evidence at any time
 *   - idempotent: same engagement event does not inflate score twice
 *   - revocation-safe: if identity linkage changes, intent attribution follows
 *
 * PIPELINE:
 *   social_engagement_events
 *   → SOCIAL-1B Identity Graph
 *   → SOCIAL-1C Interest Memory (social_interest_memory / social_interest_evidence)
 *   → Intent Evidence (social_intent_evidence)
 *   → Intent Score (social_intent_score)
 *   → existing canonical Journey (customer_journey / journey_transitions)
 *
 * IDENTITY BOUNDARY:
 *   known_person        → workspace-scoped person intent (canonical_person_id)
 *   platform_actor      → provider-scoped intent only (no person-level journey)
 *   pseudonymous_visitor → first-party pseudonymous intent where supported
 *   anonymous_aggregate → NO person-level intent, NO person-level journey
 *
 * INTEREST ≠ INTENT ≠ JOURNEY:
 *   Interest  = SOCIAL-1C (what the actor shows interest in)
 *   Intent    = SOCIAL-1D (evidence-backed strength toward a business outcome)
 *   Journey   = existing customer_journey (lifecycle/business relationship state)
 *
 * NO COMMERCIAL EXECUTION:
 *   A high intent score is DATA only.
 *   SOCIAL-1D MUST NOT send messages, create offers, book meetings, or execute NBA.
 */

// ── Scale / Bands ─────────────────────────────────────────────────────────────

/**
 * Canonical intent score scale: 0.0000 – 1.0000 (four decimal places).
 *
 * Bands are advisory labels for human/system consumption; they carry no
 * automatic action authority.
 */
export type IntentScoreBand =
  | "none"        // 0.0000 – 0.1999
  | "low"         // 0.2000 – 0.3999
  | "moderate"    // 0.4000 – 0.5999
  | "strong"      // 0.6000 – 0.7999
  | "high";       // 0.8000 – 1.0000

export function scoreToband(score: number): IntentScoreBand {
  if (score < 0.2) return "none";
  if (score < 0.4) return "low";
  if (score < 0.6) return "moderate";
  if (score < 0.8) return "strong";
  return "high";
}

// ── Evidence Types ────────────────────────────────────────────────────────────

/**
 * Canonical evidence types that MAY contribute to intent.
 * Only types that have real canonical ingestion in the repository are listed.
 * Comments/reactions/shares/views are NOT in this list.
 */
export type IntentEvidenceType =
  | "inbound_message"          // actor sent a message (from social_engagement_events)
  | "pricing_inquiry"          // message contains pricing/cost language
  | "demo_booking_request"     // message contains demo/booking/meeting language
  | "purchase_related_language"// message contains buy/purchase/order language
  | "explicit_product_interest"// explicit product or service mention (SOCIAL-1C)
  | "repeated_interest_signal" // same interest_ref seen multiple times (SOCIAL-1C)
  | "objection_signal"         // objection language (reduces or holds score)
  | "support_only_language"    // support/help language (reduces intent inference)
  | "recency_decay";            // score contribution reduced due to staleness

/** Contribution direction for a single evidence item. */
export type EvidenceContributionDirection = "positive" | "negative" | "neutral";

/** A single explainable contribution to an intent score calculation. */
export interface IntentEvidenceContribution {
  evidence_type:       IntentEvidenceType;
  direction:           EvidenceContributionDirection;
  weight:              number;     // raw weight applied (0.0 – 1.0)
  contribution:        number;     // actual delta applied to score
  source_ref?:         string;     // source engagement event or interest memory id
  evidence_timestamp:  string;     // ISO 8601 when the evidence occurred
  recency_factor?:     number;     // 0.0 – 1.0 multiplier applied for recency
}

// ── Core Intent Score Record ──────────────────────────────────────────────────

/** The canonical intent score record for a resolved identity within a workspace. */
export interface SocialIntentScore {
  id:                    string;
  workspace_id:          string;

  /** Stable key matching social_interest_memory.resolved_identity_key */
  resolved_identity_key: string;

  /** Set only when identity_state === 'known_person' */
  canonical_person_id?:  string;

  identity_state:        "known_person" | "platform_actor" | "pseudonymous_visitor";

  /** Bounded 0.0000 – 1.0000 */
  score:                 number;
  score_band:            IntentScoreBand;

  evidence_contributions: IntentEvidenceContribution[];

  /** Total number of distinct evidence items used in the current score */
  evidence_count:        number;

  /** Confidence in the score calculation (based on evidence quality/quantity) */
  confidence:            "low" | "medium" | "high";

  /** Scoring rule version — increment when scoring logic changes */
  scoring_rule_version:  string;

  first_observed_at:     string;   // ISO 8601
  last_calculated_at:    string;   // ISO 8601
}

// ── Intent Evidence Row ───────────────────────────────────────────────────────

/** A single canonical intent evidence record (maps to social_intent_evidence table). */
export interface SocialIntentEvidenceRow {
  id:                    string;
  workspace_id:          string;
  resolved_identity_key: string;
  canonical_person_id?:  string;
  engagement_event_id?:  string;
  interest_memory_id?:   string;
  evidence_type:         IntentEvidenceType;
  evidence_timestamp:    string;
  direction:             EvidenceContributionDirection;
  weight:                number;
  source_ref:            string;
  /** Prevents re-processing the same event for the same evidence type */
  idempotency_key:       string;
  state:                 "active" | "revoked";
  revoked_at?:           string;
  revocation_reason?:    string;
  created_at:            string;
}

// ── Journey Update Request ─────────────────────────────────────────────────────

/**
 * Request to update a Journey state based on computed intent.
 * SOCIAL-1D observes and scores; journey updates are evidence-backed and conservative.
 */
export interface IntentJourneyUpdateRequest {
  workspace_id:          string;
  resolved_identity_key: string;
  canonical_person_id:   string;   // only known_person may receive journey updates
  intent_score:          SocialIntentScore;
  /** The business_id (customer_journey.business_id) this journey belongs to */
  business_id:           string;
  /** The customer_id (customer_journey.customer_id) */
  customer_id:           string;
}

/** Result of attempting a journey observation update. */
export interface IntentJourneyUpdateResult {
  status:
    | "journey_updated"
    | "journey_unchanged"       // score below threshold or evidence insufficient
    | "journey_not_found"       // no existing customer_journey row
    | "blocked_anonymous"       // anonymous_aggregate may not receive journey updates
    | "blocked_non_person"      // platform_actor/pseudonymous may not receive person journey
    | "duplicate_transition"    // identical transition already recorded
    | "error";
  previous_phase?: string;
  new_phase?:      string;
  transition_trigger?: string;
}

// ── Score Compute Input ───────────────────────────────────────────────────────

/**
 * Input for computing or recomputing a score from canonical evidence.
 * All fields are sourced from existing SOCIAL-1B/1C tables.
 */
export interface ScoreComputeInput {
  workspace_id:          string;
  resolved_identity_key: string;
  canonical_person_id?:  string;
  identity_state:        "known_person" | "platform_actor" | "pseudonymous_visitor";
  /** Interest memory rows from SOCIAL-1C */
  interest_memory_rows:  Array<{
    interest_type:  string;
    interest_ref:   string;
    evidence_count: number;
    strength:       number | null;
    first_seen_at:  string;
    last_seen_at:   string;
    state:          "active" | "revoked" | "expired";
  }>;
  /** Raw engagement events for keyword/signal analysis */
  engagement_events:     Array<{
    id:              string;
    event_type:      string;
    content_ref:     string | null;
    event_timestamp: string;
    source_ref:      string;
  }>;
  /** ISO 8601 timestamp to use as "now" for recency calculations */
  as_of:                 string;
}

// ── Process Result ────────────────────────────────────────────────────────────

export interface IntentScoreProcessResult {
  status:
    | "scored"
    | "skipped_anonymous"
    | "skipped_no_evidence"
    | "error";
  score?:            SocialIntentScore;
  journey_result?:   IntentJourneyUpdateResult;
  evidence_inserted: number;
}
