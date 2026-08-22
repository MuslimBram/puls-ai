import type { IntentScoreProcessResult, SocialIntentScore } from "./social-intent-score.ts";
import {
  SCORING_RULE_VERSION,
  computeIntentScoreLocally,
  computeRecencyFactor,
  extractEvidenceFromEvent,
  extractEvidenceFromInterestMemory,
  toContribution,
  type RuntimeEngagementEvent,
  type RuntimeInterestMemory,
} from "./social-intent-signals.ts";

export type RuntimeIdentityState = "known_person" | "platform_actor" | "pseudonymous_visitor" | "anonymous_aggregate";

export interface RuntimeScoreComputeInput {
  workspace_id: string;
  resolved_identity_key: string;
  canonical_person_id?: string;
  identity_state: RuntimeIdentityState;
  interest_memory_rows: RuntimeInterestMemory[];
  engagement_events: RuntimeEngagementEvent[];
  as_of: string;
}

export interface SocialIntentDb {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from?: (table: string) => any;
}

async function loadPersistedScore(db: SocialIntentDb, input: RuntimeScoreComputeInput): Promise<any | null> {
  if (!db.from) return null;
  try {
    const { data, error } = await db
      .from("social_intent_score")
      .select("*")
      .eq("workspace_id", input.workspace_id)
      .eq("resolved_identity_key", input.resolved_identity_key)
      .maybeSingle();
    return error ? null : data ?? null;
  } catch {
    return null;
  }
}

export async function processIntentScore(
  input: RuntimeScoreComputeInput,
  db: SocialIntentDb,
): Promise<IntentScoreProcessResult> {
  if (input.identity_state === "anonymous_aggregate") {
    return { status: "skipped_anonymous", evidence_inserted: 0 };
  }
  if (!input.workspace_id || !input.resolved_identity_key) {
    return { status: "error", evidence_inserted: 0 };
  }
  if (input.identity_state === "known_person" && !input.canonical_person_id) {
    return { status: "error", evidence_inserted: 0 };
  }
  if (input.identity_state !== "known_person" && input.canonical_person_id) {
    return { status: "error", evidence_inserted: 0 };
  }

  const raw = [
    ...input.engagement_events.flatMap((event) => extractEvidenceFromEvent(event, input.as_of)),
    ...extractEvidenceFromInterestMemory(input.interest_memory_rows, input.as_of),
  ];
  const unique = new Map<string, { raw: typeof raw[number]; contribution: ReturnType<typeof toContribution> }>();
  for (const item of raw) {
    const contribution = toContribution(input.workspace_id, input.resolved_identity_key, item);
    unique.set(contribution.idempotency_key, { raw: item, contribution });
  }
  if (unique.size === 0) return { status: "skipped_no_evidence", evidence_inserted: 0 };

  let inserted = 0;
  for (const { raw: item, contribution } of unique.values()) {
    const { data, error } = await db.rpc("accumulate_social_intent_signal", {
      p_workspace_id: input.workspace_id,
      p_resolved_identity_key: input.resolved_identity_key,
      p_actor_identity_state: input.identity_state,
      p_canonical_person_id: input.identity_state === "known_person" ? input.canonical_person_id ?? null : null,
      p_engagement_event_id: item.engagement_event_id ?? null,
      p_interest_memory_id: item.interest_memory_id ?? null,
      p_evidence_type: item.evidence_type,
      p_evidence_timestamp: item.evidence_timestamp,
      p_direction: item.direction,
      p_weight: item.weight,
      p_recency_factor: item.recency_factor,
      p_source_ref: item.source_ref,
      p_idempotency_key: contribution.idempotency_key,
      p_scoring_rule_version: SCORING_RULE_VERSION,
    });
    if (error) return { status: "error", evidence_inserted: inserted };
    if (data?.evidence_inserted === true) inserted += 1;
  }

  const contributions = Array.from(unique.values()).map((x) => x.contribution);
  const local = computeIntentScoreLocally(contributions);
  const persisted = await loadPersistedScore(db, input);
  const persistedScore = Number(persisted?.score ?? local.score);
  const firstObserved = contributions.map((x) => x.evidence_timestamp).sort()[0] ?? input.as_of;
  const score: SocialIntentScore = {
    id: String(persisted?.id ?? "pending"),
    workspace_id: input.workspace_id,
    resolved_identity_key: input.resolved_identity_key,
    canonical_person_id: input.identity_state === "known_person" ? input.canonical_person_id : undefined,
    identity_state: input.identity_state,
    score: Number.isFinite(persistedScore) ? persistedScore : local.score,
    score_band: persisted?.score_band ?? local.score_band,
    evidence_contributions: Array.isArray(persisted?.evidence_contributions)
      ? persisted.evidence_contributions
      : contributions,
    evidence_count: Number(persisted?.evidence_count ?? local.evidence_count),
    confidence: persisted?.confidence ?? local.confidence,
    scoring_rule_version: persisted?.scoring_rule_version ?? SCORING_RULE_VERSION,
    first_observed_at: persisted?.first_observed_at ?? firstObserved,
    last_calculated_at: persisted?.last_calculated_at ?? input.as_of,
  };
  return { status: "scored", score, evidence_inserted: inserted };
}

export async function refreshIntentEvidenceRecency(
  db: SocialIntentDb,
  workspaceId: string,
  evidenceId: string,
  evidenceTimestamp: string,
  asOf: string,
) {
  return db.rpc("refresh_social_intent_evidence_recency", {
    p_workspace_id: workspaceId,
    p_evidence_id: evidenceId,
    p_recency_factor: computeRecencyFactor(evidenceTimestamp, asOf),
  });
}

export async function revokeIntentEvidence(
  db: SocialIntentDb,
  opts: { workspace_id: string; evidence_id: string; reason: string; revoked_by_rpc?: string },
) {
  return db.rpc("revoke_social_intent_evidence", {
    p_workspace_id: opts.workspace_id,
    p_evidence_id: opts.evidence_id,
    p_revocation_reason: opts.reason,
    p_revoked_by_rpc: opts.revoked_by_rpc ?? "social-1d-runtime",
  });
}
