/**
 * social-aggregate-report.ts — SOCIAL-1G
 *
 * Workspace-scoped Aggregate Reporting layer.
 *
 * PIPELINE:
 *   social_engagement_events (SOCIAL-0)
 *   → social_policy_evaluation_log (SOCIAL-1E)
 *   → next_best_actions with social_* columns (SOCIAL-1F)
 *   → social_1g_aggregate_snapshot (SOCIAL-1G — READ-ONLY aggregate)
 *
 * STRICT BOUNDARIES:
 *   MUST NOT send messages, create campaigns, modify policy, execute recommendations,
 *   invoke AI-3, modify business/scoring/attribution rules autonomously,
 *   or perform identity joins.
 *
 *   Aggregates are WORKSPACE-SCOPED. Cross-workspace data is rejected at DB level (RLS)
 *   and enforced in TypeScript before any DB call.
 *
 *   Anonymous aggregates remain anonymous. No person IDs in aggregate snapshots.
 *   No PII. No message bodies.
 */

import type { IntentScoreBand } from "./social-intent-score.ts";
import type { SocialNbaActionType, RecommendationStatus, SocialConfidenceBand } from "./social-nba.ts";
import type { PolicyDecision } from "./social-policy-engine.ts";
import type { CanonicalIdentityState } from "./identity-graph.ts";
import type { JourneyPhase } from "./social-intent-journey.ts";

// ── Aggregate Dimensions ──────────────────────────────────────────────────────

/**
 * All supported aggregate dimensions.
 * NULL means "not filtered" / "all values".
 */
export interface AggregateReportDimensions {
  provider?: string | null;
  channel?: string | null;
  identity_state?: CanonicalIdentityState | null;
  intent_band?: IntentScoreBand | null;
  policy_decision?: PolicyDecision | null;
  recommendation_status?: RecommendationStatus | null;
  action_type?: SocialNbaActionType | null;
  social_confidence_band?: SocialConfidenceBand | null;
  journey_phase?: JourneyPhase | null;
}

// ── Time Window ───────────────────────────────────────────────────────────────

export interface AggregateTimeWindow {
  /** ISO timestamp — inclusive start */
  start: string;
  /** ISO timestamp — exclusive end */
  end: string;
  /** Human-readable label (e.g. '2026-08-22', '2026-W34', '2026-08') */
  label: string;
}

// ── Aggregate Measures ────────────────────────────────────────────────────────

export interface AggregateReportMeasures {
  social_event_count: number;
  /** Count of distinct actor_provider_id values (only where technically valid) */
  unique_platform_actor_count: number;
  anonymous_aggregate_count: number;
  known_person_activity_count: number;

  intent_none_count: number;
  intent_low_count: number;
  intent_moderate_count: number;
  intent_strong_count: number;
  intent_high_count: number;
  /** Count of events where intent_band is 'strong' or 'high' */
  high_intent_event_count: number;

  policy_allow_count: number;
  policy_review_count: number;
  policy_block_count: number;

  nba_recommended_count: number;
  nba_do_nothing_count: number;
  nba_review_required_count: number;
  nba_blocked_count: number;

  attributed_direct_count: number;
  attributed_assisted_count: number;
  unattributed_count: number;
}

// ── Snapshot Input ────────────────────────────────────────────────────────────

export interface AggregateSnapshotInput {
  workspace_id: string;
  time_window: AggregateTimeWindow;
  dimensions: AggregateReportDimensions;
  measures: AggregateReportMeasures;
}

// ── Snapshot Result ───────────────────────────────────────────────────────────

export interface AggregateSnapshotResult {
  snapshot_id: string;
  inserted: boolean;
  workspace_id: string;
  time_window: AggregateTimeWindow;
  dimensions: AggregateReportDimensions;
  measures: AggregateReportMeasures;
  snapshot_idempotency_key: string;
}

// ── DB Adapter ────────────────────────────────────────────────────────────────

export interface SocialAggregateDb {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

// ── Idempotency Key ───────────────────────────────────────────────────────────

/**
 * Derive a deterministic snapshot idempotency key from stable inputs.
 *
 * Covers: workspace + time window + all dimension values.
 * Same inputs always produce the same key, preventing duplicate snapshots
 * from retries, replays, or concurrent ingestion paths.
 */
export function deriveSnapshotIdempotencyKey(
  workspace_id: string,
  time_window: AggregateTimeWindow,
  dimensions: AggregateReportDimensions,
): string {
  const parts = [
    workspace_id,
    time_window.start,
    time_window.end,
    dimensions.provider ?? "",
    dimensions.channel ?? "",
    dimensions.identity_state ?? "",
    dimensions.intent_band ?? "",
    dimensions.policy_decision ?? "",
    dimensions.recommendation_status ?? "",
    dimensions.action_type ?? "",
    dimensions.social_confidence_band ?? "",
    dimensions.journey_phase ?? "",
  ];
  return `social_1g_snap:${parts.join("|")}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

export type AggregateSnapshotError =
  | { kind: "WORKSPACE_MISSING" }
  | { kind: "TIME_WINDOW_INVALID"; detail: string }
  | { kind: "MEASURES_NEGATIVE"; field: string }
  | { kind: "DB_ERROR"; detail: string };

function validateSnapshotInput(
  input: AggregateSnapshotInput,
): AggregateSnapshotError | null {
  if (!input.workspace_id) return { kind: "WORKSPACE_MISSING" };

  const start = new Date(input.time_window.start);
  const end = new Date(input.time_window.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { kind: "TIME_WINDOW_INVALID", detail: "non-parseable timestamp" };
  }
  if (end <= start) {
    return { kind: "TIME_WINDOW_INVALID", detail: "end must be after start" };
  }

  const m = input.measures;
  const measureFields: Array<[keyof AggregateReportMeasures, number]> = [
    ["social_event_count", m.social_event_count],
    ["unique_platform_actor_count", m.unique_platform_actor_count],
    ["anonymous_aggregate_count", m.anonymous_aggregate_count],
    ["known_person_activity_count", m.known_person_activity_count],
    ["intent_none_count", m.intent_none_count],
    ["intent_low_count", m.intent_low_count],
    ["intent_moderate_count", m.intent_moderate_count],
    ["intent_strong_count", m.intent_strong_count],
    ["intent_high_count", m.intent_high_count],
    ["high_intent_event_count", m.high_intent_event_count],
    ["policy_allow_count", m.policy_allow_count],
    ["policy_review_count", m.policy_review_count],
    ["policy_block_count", m.policy_block_count],
    ["nba_recommended_count", m.nba_recommended_count],
    ["nba_do_nothing_count", m.nba_do_nothing_count],
    ["nba_review_required_count", m.nba_review_required_count],
    ["nba_blocked_count", m.nba_blocked_count],
    ["attributed_direct_count", m.attributed_direct_count],
    ["attributed_assisted_count", m.attributed_assisted_count],
    ["unattributed_count", m.unattributed_count],
  ];
  for (const [field, value] of measureFields) {
    if (typeof value === "number" && value < 0) {
      return { kind: "MEASURES_NEGATIVE", field };
    }
  }

  return null;
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Persist a workspace-scoped aggregate snapshot (idempotent).
 *
 * Returns a typed result or an error. Never throws on idempotent retries.
 */
export async function persistAggregateSnapshot(
  input: AggregateSnapshotInput,
  db: SocialAggregateDb,
): Promise<AggregateSnapshotResult | AggregateSnapshotError> {
  const validationError = validateSnapshotInput(input);
  if (validationError) return validationError;

  const snapshotKey = deriveSnapshotIdempotencyKey(
    input.workspace_id,
    input.time_window,
    input.dimensions,
  );

  const { data, error } = await db.rpc("upsert_social_aggregate_snapshot", {
    p_workspace_id: input.workspace_id,
    p_time_window_start: input.time_window.start,
    p_time_window_end: input.time_window.end,
    p_time_window_label: input.time_window.label,
    p_provider: input.dimensions.provider ?? null,
    p_channel: input.dimensions.channel ?? null,
    p_identity_state: input.dimensions.identity_state ?? null,
    p_intent_band: input.dimensions.intent_band ?? null,
    p_policy_decision: input.dimensions.policy_decision ?? null,
    p_recommendation_status: input.dimensions.recommendation_status ?? null,
    p_action_type: input.dimensions.action_type ?? null,
    p_social_confidence_band: input.dimensions.social_confidence_band ?? null,
    p_journey_phase: input.dimensions.journey_phase ?? null,
    p_social_event_count: input.measures.social_event_count,
    p_unique_platform_actor_count: input.measures.unique_platform_actor_count,
    p_anonymous_aggregate_count: input.measures.anonymous_aggregate_count,
    p_known_person_activity_count: input.measures.known_person_activity_count,
    p_intent_none_count: input.measures.intent_none_count,
    p_intent_low_count: input.measures.intent_low_count,
    p_intent_moderate_count: input.measures.intent_moderate_count,
    p_intent_strong_count: input.measures.intent_strong_count,
    p_intent_high_count: input.measures.intent_high_count,
    p_high_intent_event_count: input.measures.high_intent_event_count,
    p_policy_allow_count: input.measures.policy_allow_count,
    p_policy_review_count: input.measures.policy_review_count,
    p_policy_block_count: input.measures.policy_block_count,
    p_nba_recommended_count: input.measures.nba_recommended_count,
    p_nba_do_nothing_count: input.measures.nba_do_nothing_count,
    p_nba_review_required_count: input.measures.nba_review_required_count,
    p_nba_blocked_count: input.measures.nba_blocked_count,
    p_attributed_direct_count: input.measures.attributed_direct_count,
    p_attributed_assisted_count: input.measures.attributed_assisted_count,
    p_unattributed_count: input.measures.unattributed_count,
    p_snapshot_idempotency_key: snapshotKey,
  });

  if (error) {
    return { kind: "DB_ERROR", detail: String((error as any)?.message ?? error) };
  }

  const row = data as { id: string; inserted: boolean };
  return {
    snapshot_id: row.id,
    inserted: row.inserted,
    workspace_id: input.workspace_id,
    time_window: input.time_window,
    dimensions: input.dimensions,
    measures: input.measures,
    snapshot_idempotency_key: snapshotKey,
  };
}

// ── Typed Query Result for CEO Dashboard / Analytics ─────────────────────────

/**
 * Typed reporting query result.
 *
 * This is the stable contract for downstream CEO Dashboard / Analytics consumption.
 * It answers:
 *   - Which social channels produce qualified intent?
 *   - Which providers generate the most high-intent interactions?
 *   - How many social signals are BLOCK / REVIEW / ALLOW?
 *   - What NBA actions are being recommended?
 *   - Direct / assisted / unattributed conversion distribution.
 */
export interface SocialReportRow {
  workspace_id: string;
  time_window_label: string;
  time_window_start: string;
  time_window_end: string;
  provider: string | null;
  channel: string | null;
  identity_state: string | null;
  intent_band: string | null;
  policy_decision: string | null;
  recommendation_status: string | null;
  action_type: string | null;
  social_confidence_band: string | null;
  journey_phase: string | null;
  social_event_count: number;
  unique_platform_actor_count: number;
  anonymous_aggregate_count: number;
  known_person_activity_count: number;
  high_intent_event_count: number;
  policy_allow_count: number;
  policy_review_count: number;
  policy_block_count: number;
  nba_recommended_count: number;
  nba_do_nothing_count: number;
  nba_review_required_count: number;
  nba_blocked_count: number;
  attributed_direct_count: number;
  attributed_assisted_count: number;
  unattributed_count: number;
}
