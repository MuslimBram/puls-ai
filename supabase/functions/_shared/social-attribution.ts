/**
 * social-attribution.ts — SOCIAL-1G
 *
 * Attribution Engine: deterministic social attribution against canonical outcomes.
 *
 * PIPELINE:
 *   next_best_actions (SOCIAL-1F) + social_1g_attribution_window_config
 *   → deterministic attribution decision
 *   → social_1g_attribution_record (append-only, idempotent)
 *
 * ATTRIBUTION SEMANTICS:
 *   DIRECT_EVIDENCE_BACKED  — outcome within direct_window_days of qualifying social event;
 *                             traceable canonical evidence exists.
 *   INFERRED_ASSISTED        — outcome within assisted_window_days (but not direct window);
 *                             evidence present but weaker causal link.
 *   UNATTRIBUTED             — no qualifying evidence within any window,
 *                             or evidence is insufficient. Never fabricated.
 *
 * STRICT BOUNDARIES:
 *   MUST NOT create new canonical_person_id.
 *   MUST NOT join anonymous_aggregate / platform_actor / known_person.
 *   MUST NOT perform identity resolution.
 *   MUST NOT execute recommendations.
 *   MUST NOT mutate policy, NBA rules, or scoring rules.
 *
 * DETERMINISM:
 *   Same inputs → same attribution decision.
 *   Multiple qualifying events: handled per attribution_model config.
 *   Repeated conversions: each outcome_ref may have at most one attribution
 *     record per source evidence, enforced by idempotency_key uniqueness.
 *   Future timestamps: rejected with an explicit error.
 */

import type { IntentScoreBand } from "./social-intent-score.ts";
import type { RecommendationStatus, SocialConfidenceBand } from "./social-nba.ts";
import type { PolicyDecision } from "./social-policy-engine.ts";
import type { CanonicalIdentityState } from "./identity-graph.ts";

// ── Attribution Method ────────────────────────────────────────────────────────

/**
 * Canonical attribution method.
 *
 * These names are the authoritative contract for SOCIAL-1G.
 * Do not rename without a documented migration.
 */
export type AttributionMethod =
  | "DIRECT_EVIDENCE_BACKED"
  | "INFERRED_ASSISTED"
  | "UNATTRIBUTED";

// ── Attribution Reason Codes ──────────────────────────────────────────────────

export type AttributionReasonCode =
  | "WITHIN_DIRECT_WINDOW"
  | "WITHIN_ASSISTED_WINDOW"
  | "OUTSIDE_ALL_WINDOWS"
  | "INSUFFICIENT_EVIDENCE"
  | "NO_QUALIFYING_NBA"
  | "FUTURE_OUTCOME_TIMESTAMP"
  | "CROSS_WORKSPACE_REJECTED"
  | "ANONYMOUS_AGGREGATE_NOT_ATTRIBUTABLE"
  | "POLICY_BLOCK_NOT_ATTRIBUTABLE"
  | "CONFIDENCE_BELOW_THRESHOLD"
  | "DUPLICATE_IDEMPOTENT"
  | "EVIDENCE_BACKED_DIRECT"
  | "EVIDENCE_ASSISTED"
  | "NO_EVIDENCE_UNATTRIBUTED";

// ── Attribution Window Config ─────────────────────────────────────────────────

/**
 * Attribution window configuration.
 * Workspace-specific via social_1g_attribution_window_config table.
 * Safe defaults if no workspace config exists.
 */
export interface AttributionWindowConfig {
  workspace_id: string;
  direct_window_days: number;
  assisted_window_days: number;
  attribution_model: "first_touch" | "last_touch" | "linear";
  min_qualifying_intent_band: IntentScoreBand;
}

export const ATTRIBUTION_WINDOW_DEFAULTS: Omit<AttributionWindowConfig, "workspace_id"> = {
  direct_window_days: 7,
  assisted_window_days: 30,
  attribution_model: "first_touch",
  min_qualifying_intent_band: "low",
} as const;

// ── Band Ordering ─────────────────────────────────────────────────────────────

const INTENT_BAND_ORDER: Record<IntentScoreBand, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  strong: 3,
  high: 4,
};

function intentBandMeetsMinimum(
  band: IntentScoreBand,
  minimum: IntentScoreBand,
): boolean {
  return INTENT_BAND_ORDER[band] >= INTENT_BAND_ORDER[minimum];
}

// ── Social Evidence (from NBA record) ────────────────────────────────────────

/**
 * Qualifying social evidence from an upstream NBA record (SOCIAL-1F).
 *
 * This is read-only input; attribution never modifies it.
 */
export interface SocialEvidenceRef {
  workspace_id: string;
  nba_idempotency_key: string;
  source_event_idempotency_key?: string;
  evidence_refs: string[];
  provider: string;
  channel: string;
  /** As resolved upstream — never modified here */
  identity_state: CanonicalIdentityState;
  /** Only set when identity_state === 'known_person'; never created here */
  canonical_person_id?: string;
  intent_score: number;
  intent_score_band: IntentScoreBand;
  social_confidence_band: SocialConfidenceBand;
  recommendation_status: RecommendationStatus;
  policy_decision: PolicyDecision;
  confidence: number;
  /** When this NBA was recommended (ISO timestamp) */
  recommended_at: string;
}

// ── Attribution Input ─────────────────────────────────────────────────────────

export interface AttributionInput {
  /** Must match evidence workspace_id exactly */
  workspace_id: string;

  /** Outcome / conversion reference (e.g. order ID, deal ID) */
  outcome_ref: string;

  /** When the conversion/revenue event occurred (ISO timestamp) */
  outcome_timestamp: string;

  /**
   * Qualifying social evidence candidates (from upstream NBA records).
   * The engine selects qualifying evidence per attribution_model.
   * May be empty → UNATTRIBUTED.
   */
  evidence_candidates: SocialEvidenceRef[];

  /** Attribution window config for this workspace */
  window_config: AttributionWindowConfig;

  /**
   * Stable idempotency key for this attribution event.
   * Format: 'social_1g_attr:<workspace_id>:<outcome_ref>:<source_nba_idempotency_key>'
   * Caller provides this to support retry/replay safety.
   */
  idempotency_key: string;
}

// ── Attribution Result ────────────────────────────────────────────────────────

export interface AttributionResult {
  workspace_id: string;
  outcome_ref: string;
  outcome_timestamp: string;
  attribution_method: AttributionMethod;
  attribution_reason_codes: AttributionReasonCode[];
  /** The evidence record selected as the attribution source (null if UNATTRIBUTED) */
  selected_evidence: SocialEvidenceRef | null;
  attribution_window_direct_days: number;
  attribution_window_assisted_days: number;
  /** Confidence mirrored from selected evidence; null if UNATTRIBUTED */
  attribution_confidence: number | null;
  idempotency_key: string;
}

// ── Attribution Error ─────────────────────────────────────────────────────────

export type AttributionError =
  | { kind: "WORKSPACE_MISMATCH"; detail: string }
  | { kind: "FUTURE_TIMESTAMP"; detail: string }
  | { kind: "INVALID_INPUT"; detail: string }
  | { kind: "DB_ERROR"; detail: string };

// ── DB Adapter ────────────────────────────────────────────────────────────────

export interface SocialAttributionDb {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

// ── Core Attribution Logic ────────────────────────────────────────────────────

/**
 * Select qualifying evidence candidates.
 *
 * Rules:
 *   1. Must belong to the same workspace.
 *   2. Must not be anonymous_aggregate (cannot be attributed to a person).
 *   3. Policy must not be BLOCK (blocked evidence is reportable but not attributable).
 *   4. Recommendation status must not be 'blocked' or 'do_nothing'.
 *   5. Intent band must meet or exceed min_qualifying_intent_band.
 *   6. recommended_at must be before outcome_timestamp.
 *
 * This function does NOT create new identity joins.
 */
function selectQualifyingEvidence(
  candidates: SocialEvidenceRef[],
  workspace_id: string,
  outcome_ts: Date,
  config: AttributionWindowConfig,
): SocialEvidenceRef[] {
  return candidates.filter((ev) => {
    // Workspace boundary — hard reject cross-workspace evidence
    if (ev.workspace_id !== workspace_id) return false;
    // Anonymous aggregate cannot be attributed to a person
    if (ev.identity_state === "anonymous_aggregate") return false;
    // Policy BLOCK — reportable but not attributable
    if (ev.policy_decision === "BLOCK") return false;
    // Blocked/do_nothing NBA — not attributable
    if (ev.recommendation_status === "blocked" || ev.recommendation_status === "do_nothing") return false;
    // Intent must meet minimum threshold
    if (!intentBandMeetsMinimum(ev.intent_score_band, config.min_qualifying_intent_band)) return false;
    // Evidence must precede the outcome
    const recAt = new Date(ev.recommended_at);
    if (isNaN(recAt.getTime())) return false;
    if (recAt >= outcome_ts) return false;
    return true;
  });
}

/**
 * Classify a single evidence record as DIRECT or ASSISTED based on window.
 */
function classifyWindow(
  evidence: SocialEvidenceRef,
  outcome_ts: Date,
  config: AttributionWindowConfig,
): "DIRECT_EVIDENCE_BACKED" | "INFERRED_ASSISTED" | null {
  const recAt = new Date(evidence.recommended_at);
  if (isNaN(recAt.getTime())) return null;
  const diffDays = (outcome_ts.getTime() - recAt.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= config.direct_window_days) return "DIRECT_EVIDENCE_BACKED";
  if (diffDays <= config.assisted_window_days) return "INFERRED_ASSISTED";
  return null;
}

/**
 * Select a single evidence record per attribution_model from qualifying candidates.
 *
 * first_touch: earliest qualifying evidence within any window
 * last_touch:  latest qualifying evidence within any window
 * linear:      earliest within direct window; fallback to earliest within assisted
 *
 * Returns null if no evidence qualifies within any window.
 */
function applyAttributionModel(
  qualifying: SocialEvidenceRef[],
  outcome_ts: Date,
  config: AttributionWindowConfig,
): SocialEvidenceRef | null {
  const withinWindow = qualifying.filter(
    (ev) => classifyWindow(ev, outcome_ts, config) !== null,
  );
  if (withinWindow.length === 0) return null;

  if (config.attribution_model === "first_touch") {
    return withinWindow.reduce((a, b) =>
      new Date(a.recommended_at) <= new Date(b.recommended_at) ? a : b,
    );
  }
  if (config.attribution_model === "last_touch") {
    return withinWindow.reduce((a, b) =>
      new Date(a.recommended_at) >= new Date(b.recommended_at) ? a : b,
    );
  }
  // linear: prefer direct window, then assisted
  const direct = withinWindow.filter(
    (ev) => classifyWindow(ev, outcome_ts, config) === "DIRECT_EVIDENCE_BACKED",
  );
  if (direct.length > 0) {
    return direct.reduce((a, b) =>
      new Date(a.recommended_at) <= new Date(b.recommended_at) ? a : b,
    );
  }
  return withinWindow.reduce((a, b) =>
    new Date(a.recommended_at) <= new Date(b.recommended_at) ? a : b,
  );
}

// ── Deterministic Attribution Decision ───────────────────────────────────────

/**
 * Compute a deterministic attribution result.
 *
 * Pure function: no DB calls. Use persistAttribution() to write the result.
 */
export function computeAttribution(input: AttributionInput): AttributionResult | AttributionError {
  if (!input.workspace_id || !input.outcome_ref || !input.outcome_timestamp) {
    return { kind: "INVALID_INPUT", detail: "workspace_id, outcome_ref, outcome_timestamp are required" };
  }

  const outcome_ts = new Date(input.outcome_timestamp);
  if (isNaN(outcome_ts.getTime())) {
    return { kind: "INVALID_INPUT", detail: `unparseable outcome_timestamp: ${input.outcome_timestamp}` };
  }

  const now = new Date();
  // Reject future outcome timestamps (allow 1-second clock skew)
  if (outcome_ts.getTime() > now.getTime() + 1000) {
    return {
      kind: "FUTURE_TIMESTAMP",
      detail: `outcome_timestamp ${input.outcome_timestamp} is in the future`,
    };
  }

  // Validate workspace consistency
  for (const ev of input.evidence_candidates) {
    if (ev.workspace_id !== input.workspace_id) {
      return {
        kind: "WORKSPACE_MISMATCH",
        detail: `evidence workspace_id ${ev.workspace_id} does not match ${input.workspace_id}`,
      };
    }
  }

  const config = input.window_config;

  // Select qualifying evidence
  const qualifying = selectQualifyingEvidence(
    input.evidence_candidates,
    input.workspace_id,
    outcome_ts,
    config,
  );

  if (qualifying.length === 0) {
    const reasonCodes: AttributionReasonCode[] = [];
    if (input.evidence_candidates.length === 0) {
      reasonCodes.push("NO_QUALIFYING_NBA");
    } else {
      // Check why evidence was disqualified
      const hasAnon = input.evidence_candidates.some((e) => e.identity_state === "anonymous_aggregate");
      const hasBlock = input.evidence_candidates.some((e) => e.policy_decision === "BLOCK");
      const hasInsufficient = input.evidence_candidates.some(
        (e) => !intentBandMeetsMinimum(e.intent_score_band, config.min_qualifying_intent_band),
      );
      if (hasAnon) reasonCodes.push("ANONYMOUS_AGGREGATE_NOT_ATTRIBUTABLE");
      if (hasBlock) reasonCodes.push("POLICY_BLOCK_NOT_ATTRIBUTABLE");
      if (hasInsufficient) reasonCodes.push("INSUFFICIENT_EVIDENCE");
      if (reasonCodes.length === 0) reasonCodes.push("OUTSIDE_ALL_WINDOWS");
    }
    reasonCodes.push("NO_EVIDENCE_UNATTRIBUTED");

    return {
      workspace_id: input.workspace_id,
      outcome_ref: input.outcome_ref,
      outcome_timestamp: input.outcome_timestamp,
      attribution_method: "UNATTRIBUTED",
      attribution_reason_codes: reasonCodes,
      selected_evidence: null,
      attribution_window_direct_days: config.direct_window_days,
      attribution_window_assisted_days: config.assisted_window_days,
      attribution_confidence: null,
      idempotency_key: input.idempotency_key,
    };
  }

  const selected = applyAttributionModel(qualifying, outcome_ts, config);

  if (!selected) {
    return {
      workspace_id: input.workspace_id,
      outcome_ref: input.outcome_ref,
      outcome_timestamp: input.outcome_timestamp,
      attribution_method: "UNATTRIBUTED",
      attribution_reason_codes: ["OUTSIDE_ALL_WINDOWS", "NO_EVIDENCE_UNATTRIBUTED"],
      selected_evidence: null,
      attribution_window_direct_days: config.direct_window_days,
      attribution_window_assisted_days: config.assisted_window_days,
      attribution_confidence: null,
      idempotency_key: input.idempotency_key,
    };
  }

  const windowClass = classifyWindow(selected, outcome_ts, config);
  if (!windowClass) {
    return {
      workspace_id: input.workspace_id,
      outcome_ref: input.outcome_ref,
      outcome_timestamp: input.outcome_timestamp,
      attribution_method: "UNATTRIBUTED",
      attribution_reason_codes: ["OUTSIDE_ALL_WINDOWS", "NO_EVIDENCE_UNATTRIBUTED"],
      selected_evidence: null,
      attribution_window_direct_days: config.direct_window_days,
      attribution_window_assisted_days: config.assisted_window_days,
      attribution_confidence: null,
      idempotency_key: input.idempotency_key,
    };
  }

  const reasonCode: AttributionReasonCode =
    windowClass === "DIRECT_EVIDENCE_BACKED" ? "EVIDENCE_BACKED_DIRECT" : "EVIDENCE_ASSISTED";
  const windowReasonCode: AttributionReasonCode =
    windowClass === "DIRECT_EVIDENCE_BACKED" ? "WITHIN_DIRECT_WINDOW" : "WITHIN_ASSISTED_WINDOW";

  return {
    workspace_id: input.workspace_id,
    outcome_ref: input.outcome_ref,
    outcome_timestamp: input.outcome_timestamp,
    attribution_method: windowClass,
    attribution_reason_codes: [windowReasonCode, reasonCode],
    selected_evidence: selected,
    attribution_window_direct_days: config.direct_window_days,
    attribution_window_assisted_days: config.assisted_window_days,
    attribution_confidence: selected.confidence,
    idempotency_key: input.idempotency_key,
  };
}

// ── Persist Attribution ───────────────────────────────────────────────────────

export interface PersistAttributionResult {
  attribution_id: string;
  inserted: boolean;
  attribution_method: AttributionMethod;
  idempotency_key: string;
}

/**
 * Persist a computed attribution result (idempotent).
 *
 * Safe under retries: ON CONFLICT DO NOTHING.
 * Same idempotency_key will return inserted=false on subsequent calls.
 */
export async function persistAttribution(
  result: AttributionResult,
  db: SocialAttributionDb,
): Promise<PersistAttributionResult | AttributionError> {
  const ev = result.selected_evidence;

  const { data, error } = await db.rpc("record_social_attribution", {
    p_workspace_id: result.workspace_id,
    p_outcome_ref: result.outcome_ref,
    p_outcome_timestamp: result.outcome_timestamp,
    p_attribution_method: result.attribution_method,
    p_attribution_reason_codes: result.attribution_reason_codes,
    p_source_nba_idempotency_key: ev?.nba_idempotency_key ?? null,
    p_source_event_idempotency_key: ev?.source_event_idempotency_key ?? null,
    p_source_evidence_refs: ev?.evidence_refs ?? [],
    p_provider: ev?.provider ?? null,
    p_channel: ev?.channel ?? null,
    p_identity_state: ev?.identity_state ?? null,
    p_social_canonical_person_id: ev?.canonical_person_id ?? null,
    p_attribution_window_direct_days: result.attribution_window_direct_days,
    p_attribution_window_assisted_days: result.attribution_window_assisted_days,
    p_attribution_confidence: result.attribution_confidence,
    p_policy_decision: ev?.policy_decision ?? null,
    p_intent_score: ev?.intent_score ?? null,
    p_intent_score_band: ev?.intent_score_band ?? null,
    p_social_confidence_band: ev?.social_confidence_band ?? null,
    p_recommendation_status: ev?.recommendation_status ?? null,
    p_idempotency_key: result.idempotency_key,
    p_attributed_at: new Date().toISOString(),
  });

  if (error) {
    return { kind: "DB_ERROR", detail: String((error as any)?.message ?? error) };
  }

  const row = data as { id: string; inserted: boolean };
  return {
    attribution_id: row.id,
    inserted: row.inserted,
    attribution_method: result.attribution_method,
    idempotency_key: result.idempotency_key,
  };
}

// ── Idempotency Key Builder ───────────────────────────────────────────────────

/**
 * Derive a deterministic attribution idempotency key.
 *
 * Covers: workspace + outcome_ref + source_nba_idempotency_key.
 * Two retries for the same outcome + evidence → same key → idempotent.
 * Different outcomes or different evidence → different keys.
 */
export function deriveAttributionIdempotencyKey(
  workspace_id: string,
  outcome_ref: string,
  source_nba_idempotency_key: string,
): string {
  return `social_1g_attr:${workspace_id}:${outcome_ref}:${source_nba_idempotency_key}`;
}
