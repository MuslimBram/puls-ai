import type {
  IntentJourneyUpdateRequest,
  IntentJourneyUpdateResult,
  SocialIntentScore,
} from "./social-intent-score.ts";
import { SCORING_RULE_VERSION } from "./social-intent-signals.ts";
import type { SocialIntentDb } from "./social-intent-runtime.ts";

export type JourneyPhase =
  | "first_touch"
  | "exploring"
  | "considering"
  | "converting"
  | "onboarding"
  | "active"
  | "at_risk"
  | "dormant"
  | "champion";

const NEXT: Partial<Record<JourneyPhase, JourneyPhase>> = {
  first_touch: "exploring",
  exploring: "considering",
  considering: "converting",
};
const MIN_SCORE: Partial<Record<JourneyPhase, number>> = {
  exploring: 0.2,
  considering: 0.4,
  converting: 0.7,
};
const MIN_EVIDENCE: Partial<Record<JourneyPhase, number>> = {
  exploring: 2,
  considering: 2,
  converting: 3,
};

export function isJourneyTransitionAllowed(
  from: JourneyPhase,
  to: JourneyPhase,
  score: Pick<SocialIntentScore, "score" | "evidence_count">,
): boolean {
  if (NEXT[from] !== to) return false;
  return score.score >= (MIN_SCORE[to] ?? Infinity) && score.evidence_count >= (MIN_EVIDENCE[to] ?? Infinity);
}

export function computeTargetJourneyPhase(
  current: JourneyPhase,
  score: Pick<SocialIntentScore, "score" | "evidence_count">,
): JourneyPhase | null {
  const target = NEXT[current];
  return target && isJourneyTransitionAllowed(current, target, score) ? target : null;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildJourneyObservationKey(request: IntentJourneyUpdateRequest): string {
  const keys = request.intent_score.evidence_contributions
    .map((item: any) => item.idempotency_key ?? item.evidence_id ?? `${item.evidence_type}:${item.source_ref ?? ""}:${item.evidence_timestamp}`)
    .sort();
  return fnv1a32([
    request.workspace_id,
    request.resolved_identity_key,
    request.canonical_person_id,
    request.business_id,
    request.customer_id,
    SCORING_RULE_VERSION,
    ...keys,
  ].join("|"));
}

export async function observeJourneyFromIntentScore(
  request: IntentJourneyUpdateRequest,
  db: SocialIntentDb,
): Promise<IntentJourneyUpdateResult> {
  if (request.intent_score.identity_state !== "known_person") return { status: "blocked_non_person" };
  if (request.intent_score.canonical_person_id !== request.canonical_person_id) return { status: "blocked_non_person" };

  const { data, error } = await db.rpc("observe_social_intent_journey", {
    p_workspace_id: request.workspace_id,
    p_canonical_person_id: request.canonical_person_id,
    p_business_id: request.business_id,
    p_customer_id: request.customer_id,
    p_resolved_identity_key: request.resolved_identity_key,
    p_intent_score: request.intent_score.score,
    p_evidence_count: request.intent_score.evidence_count,
    p_observation_key: buildJourneyObservationKey(request),
  });
  if (error) return { status: "error" };

  const rawStatus = String(data?.status ?? "error");
  if (rawStatus === "blocked_unverified_customer") return { status: "blocked_non_person" };
  const allowed = new Set([
    "journey_updated",
    "journey_unchanged",
    "journey_not_found",
    "blocked_non_person",
    "duplicate_transition",
    "error",
  ]);
  const status = allowed.has(rawStatus) ? rawStatus : "error";
  return {
    status: status as IntentJourneyUpdateResult["status"],
    previous_phase: data?.previous_phase ?? undefined,
    new_phase: data?.new_phase ?? undefined,
    transition_trigger: data?.transition_trigger ?? undefined,
  };
}
