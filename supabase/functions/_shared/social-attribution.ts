/**
 * social-attribution.ts — SOCIAL-1G
 *
 * Deterministic, workspace-scoped social attribution.
 *
 * Corrective safety contract:
 * - attribution-window config must belong to the same workspace as the outcome;
 * - non-known identities must never carry a canonical_person_id;
 * - time proximity alone is NOT direct causal evidence;
 * - until a canonical outcome↔social-evidence link exists, new qualifying attribution
 *   is INFERRED_ASSISTED or UNATTRIBUTED, never DIRECT_EVIDENCE_BACKED;
 * - no identity resolution, execution, campaign mutation, or policy mutation occurs here.
 */

import type { IntentScoreBand } from "./social-intent-score.ts";
import type { RecommendationStatus, SocialConfidenceBand } from "./social-nba.ts";
import type { PolicyDecision } from "./social-policy-engine.ts";
import type { CanonicalIdentityState } from "./identity-graph.ts";

export type AttributionMethod =
  | "DIRECT_EVIDENCE_BACKED"
  | "INFERRED_ASSISTED"
  | "UNATTRIBUTED";

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
  | "DIRECT_LINK_NOT_AVAILABLE"
  | "NO_EVIDENCE_UNATTRIBUTED";

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

export interface SocialEvidenceRef {
  workspace_id: string;
  nba_idempotency_key: string;
  source_event_idempotency_key?: string;
  evidence_refs: string[];
  provider: string;
  channel: string;
  /** Upstream identity state. SOCIAL-1G never promotes it. */
  identity_state: CanonicalIdentityState;
  /** Allowed only when identity_state === "known_person". */
  canonical_person_id?: string;
  intent_score: number;
  intent_score_band: IntentScoreBand;
  social_confidence_band: SocialConfidenceBand;
  recommendation_status: RecommendationStatus;
  policy_decision: PolicyDecision;
  confidence: number;
  recommended_at: string;
}

export interface AttributionInput {
  workspace_id: string;
  outcome_ref: string;
  outcome_timestamp: string;
  evidence_candidates: SocialEvidenceRef[];
  window_config: AttributionWindowConfig;
  idempotency_key: string;
}

export interface AttributionResult {
  workspace_id: string;
  outcome_ref: string;
  outcome_timestamp: string;
  attribution_method: AttributionMethod;
  attribution_reason_codes: AttributionReasonCode[];
  selected_evidence: SocialEvidenceRef | null;
  attribution_window_direct_days: number;
  attribution_window_assisted_days: number;
  attribution_confidence: number | null;
  idempotency_key: string;
}

export type AttributionError =
  | { kind: "WORKSPACE_MISMATCH"; detail: string }
  | { kind: "FUTURE_TIMESTAMP"; detail: string }
  | { kind: "INVALID_INPUT"; detail: string }
  | { kind: "DB_ERROR"; detail: string };

export interface SocialAttributionDb {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

function validateIdentityInvariant(ev: SocialEvidenceRef): AttributionError | null {
  if (ev.identity_state !== "known_person" && ev.canonical_person_id != null) {
    return {
      kind: "INVALID_INPUT",
      detail:
        `canonical_person_id is forbidden for identity_state=${ev.identity_state}; ` +
        "SOCIAL-1G must not promote or join identities",
    };
  }
  return null;
}

function selectQualifyingEvidence(
  candidates: SocialEvidenceRef[],
  workspace_id: string,
  outcomeTs: Date,
  config: AttributionWindowConfig,
): SocialEvidenceRef[] {
  return candidates.filter((ev) => {
    if (ev.workspace_id !== workspace_id) return false;
    if (ev.identity_state === "anonymous_aggregate") return false;
    if (ev.policy_decision === "BLOCK") return false;
    if (ev.recommendation_status === "blocked" || ev.recommendation_status === "do_nothing") {
      return false;
    }
    if (!intentBandMeetsMinimum(ev.intent_score_band, config.min_qualifying_intent_band)) {
      return false;
    }

    const recommendedAt = new Date(ev.recommended_at);
    if (Number.isNaN(recommendedAt.getTime())) return false;
    if (recommendedAt >= outcomeTs) return false;
    return true;
  });
}

/**
 * Classify by temporal eligibility only.
 *
 * IMPORTANT: the repository currently has no independent canonical
 * outcome↔social-evidence linkage contract. Therefore proximity inside the old
 * "direct" window is still only assisted/correlative evidence.
 */
function classifyWindow(
  evidence: SocialEvidenceRef,
  outcomeTs: Date,
  config: AttributionWindowConfig,
): "INFERRED_ASSISTED" | null {
  const recommendedAt = new Date(evidence.recommended_at);
  if (Number.isNaN(recommendedAt.getTime())) return null;

  const diffDays =
    (outcomeTs.getTime() - recommendedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays <= config.assisted_window_days) return "INFERRED_ASSISTED";
  return null;
}

function applyAttributionModel(
  qualifying: SocialEvidenceRef[],
  outcomeTs: Date,
  config: AttributionWindowConfig,
): SocialEvidenceRef | null {
  const withinWindow = qualifying.filter(
    (ev) => classifyWindow(ev, outcomeTs, config) !== null,
  );

  if (withinWindow.length === 0) return null;

  if (config.attribution_model === "last_touch") {
    return withinWindow.reduce((a, b) =>
      new Date(a.recommended_at) >= new Date(b.recommended_at) ? a : b,
    );
  }

  // first_touch and the current safe linear fallback both choose the earliest
  // qualifying evidence. No proportional causal credit is fabricated here.
  return withinWindow.reduce((a, b) =>
    new Date(a.recommended_at) <= new Date(b.recommended_at) ? a : b,
  );
}

export function computeAttribution(
  input: AttributionInput,
): AttributionResult | AttributionError {
  if (!input.workspace_id || !input.outcome_ref || !input.outcome_timestamp) {
    return {
      kind: "INVALID_INPUT",
      detail: "workspace_id, outcome_ref, outcome_timestamp are required",
    };
  }

  if (!input.window_config || input.window_config.workspace_id !== input.workspace_id) {
    return {
      kind: "WORKSPACE_MISMATCH",
      detail:
        `window_config workspace_id ${input.window_config?.workspace_id ?? "missing"} ` +
        `does not match ${input.workspace_id}`,
    };
  }

  const outcomeTs = new Date(input.outcome_timestamp);
  if (Number.isNaN(outcomeTs.getTime())) {
    return {
      kind: "INVALID_INPUT",
      detail: `unparseable outcome_timestamp: ${input.outcome_timestamp}`,
    };
  }

  const now = new Date();
  if (outcomeTs.getTime() > now.getTime() + 1000) {
    return {
      kind: "FUTURE_TIMESTAMP",
      detail: `outcome_timestamp ${input.outcome_timestamp} is in the future`,
    };
  }

  for (const ev of input.evidence_candidates) {
    if (ev.workspace_id !== input.workspace_id) {
      return {
        kind: "WORKSPACE_MISMATCH",
        detail: `evidence workspace_id ${ev.workspace_id} does not match ${input.workspace_id}`,
      };
    }

    const identityError = validateIdentityInvariant(ev);
    if (identityError) return identityError;
  }

  const config = input.window_config;
  const qualifying = selectQualifyingEvidence(
    input.evidence_candidates,
    input.workspace_id,
    outcomeTs,
    config,
  );

  if (qualifying.length === 0) {
    const reasonCodes: AttributionReasonCode[] = [];

    if (input.evidence_candidates.length === 0) {
      reasonCodes.push("NO_QUALIFYING_NBA");
    } else {
      const hasAnon = input.evidence_candidates.some(
        (e) => e.identity_state === "anonymous_aggregate",
      );
      const hasBlock = input.evidence_candidates.some(
        (e) => e.policy_decision === "BLOCK",
      );
      const hasInsufficient = input.evidence_candidates.some(
        (e) => !intentBandMeetsMinimum(
          e.intent_score_band,
          config.min_qualifying_intent_band,
        ),
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

  const selected = applyAttributionModel(qualifying, outcomeTs, config);
  if (!selected) {
    return {
      workspace_id: input.workspace_id,
      outcome_ref: input.outcome_ref,
      outcome_timestamp: input.outcome_timestamp,
      attribution_method: "UNATTRIBUTED",
      attribution_reason_codes: [
        "OUTSIDE_ALL_WINDOWS",
        "NO_EVIDENCE_UNATTRIBUTED",
      ],
      selected_evidence: null,
      attribution_window_direct_days: config.direct_window_days,
      attribution_window_assisted_days: config.assisted_window_days,
      attribution_confidence: null,
      idempotency_key: input.idempotency_key,
    };
  }

  const recommendedAt = new Date(selected.recommended_at);
  const diffDays =
    (outcomeTs.getTime() - recommendedAt.getTime()) / (1000 * 60 * 60 * 24);

  const reasonCodes: AttributionReasonCode[] = [
    "WITHIN_ASSISTED_WINDOW",
    "EVIDENCE_ASSISTED",
  ];

  if (diffDays <= config.direct_window_days) {
    reasonCodes.push("DIRECT_LINK_NOT_AVAILABLE");
  }

  return {
    workspace_id: input.workspace_id,
    outcome_ref: input.outcome_ref,
    outcome_timestamp: input.outcome_timestamp,
    attribution_method: "INFERRED_ASSISTED",
    attribution_reason_codes: reasonCodes,
    selected_evidence: selected,
    attribution_window_direct_days: config.direct_window_days,
    attribution_window_assisted_days: config.assisted_window_days,
    attribution_confidence: selected.confidence,
    idempotency_key: input.idempotency_key,
  };
}

export interface PersistAttributionResult {
  attribution_id: string;
  inserted: boolean;
  attribution_method: AttributionMethod;
  idempotency_key: string;
}

export async function persistAttribution(
  result: AttributionResult,
  db: SocialAttributionDb,
): Promise<PersistAttributionResult | AttributionError> {
  const ev = result.selected_evidence;

  if (result.attribution_method === "DIRECT_EVIDENCE_BACKED") {
    return {
      kind: "INVALID_INPUT",
      detail:
        "DIRECT_EVIDENCE_BACKED cannot be persisted until a canonical outcome↔social-evidence link contract exists",
    };
  }

  if (ev) {
    const identityError = validateIdentityInvariant(ev);
    if (identityError) return identityError;
  }

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
    return {
      kind: "DB_ERROR",
      detail: String((error as any)?.message ?? error),
    };
  }

  const row = (data as Array<{ id: string; inserted: boolean }>)[0];
  if (!row) {
    return {
      kind: "DB_ERROR",
      detail: "record_social_attribution returned no row",
    };
  }

  return {
    attribution_id: row.id,
    inserted: row.inserted,
    attribution_method: result.attribution_method,
    idempotency_key: result.idempotency_key,
  };
}

export function deriveAttributionIdempotencyKey(
  workspace_id: string,
  outcome_ref: string,
  source_nba_idempotency_key: string,
): string {
  return `social_1g_attr:${workspace_id}:${outcome_ref}:${source_nba_idempotency_key}`;
}
