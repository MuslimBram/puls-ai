import type {
  EvidenceContributionDirection,
  IntentEvidenceContribution,
  IntentEvidenceType,
  IntentScoreBand,
  SocialIntentScore,
} from "./social-intent-score.ts";

export const SCORING_RULE_VERSION = "1.0.0";
export const RECENCY_HALF_LIFE_DAYS = 7;
export const MIN_RECENCY_FACTOR = 0.001;

export const EVIDENCE_WEIGHTS: Readonly<Record<IntentEvidenceType, number>> = {
  inbound_message: 0.08,
  pricing_inquiry: 0.22,
  demo_booking_request: 0.35,
  purchase_related_language: 0.45,
  explicit_product_interest: 0.18,
  repeated_interest_signal: 0.12,
  objection_signal: 0.20,
  support_only_language: 0.12,
  recency_decay: 0,
};

export const EVIDENCE_DIRECTIONS: Readonly<Record<IntentEvidenceType, EvidenceContributionDirection>> = {
  inbound_message: "positive",
  pricing_inquiry: "positive",
  demo_booking_request: "positive",
  purchase_related_language: "positive",
  explicit_product_interest: "positive",
  repeated_interest_signal: "positive",
  objection_signal: "negative",
  support_only_language: "negative",
  recency_decay: "neutral",
};

export interface RuntimeEngagementEvent {
  id: string;
  event_type: string;
  content_ref: string | null;
  event_timestamp: string;
  source_ref: string;
}

export interface RuntimeInterestMemory {
  id?: string;
  interest_type: string;
  interest_ref: string;
  evidence_count: number;
  strength: number | null;
  first_seen_at: string;
  last_seen_at: string;
  state: "active" | "revoked" | "expired";
}

export interface RuntimeEvidence {
  evidence_type: IntentEvidenceType;
  direction: EvidenceContributionDirection;
  weight: number;
  recency_factor: number;
  evidence_timestamp: string;
  source_ref: string;
  engagement_event_id?: string;
  interest_memory_id?: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function scoreToBand(score: number): IntentScoreBand {
  const bounded = clamp01(Number.isFinite(score) ? score : 0);
  if (bounded < 0.2) return "none";
  if (bounded < 0.4) return "low";
  if (bounded < 0.6) return "moderate";
  if (bounded < 0.8) return "strong";
  return "high";
}

export function classifyIntentConfidence(count: number): "low" | "medium" | "high" {
  if (count <= 1) return "low";
  if (count <= 3) return "medium";
  return "high";
}

export function computeRecencyFactor(evidenceTimestamp: string, asOf: string): number {
  const evidenceMs = Date.parse(evidenceTimestamp);
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(evidenceMs) || !Number.isFinite(asOfMs)) return MIN_RECENCY_FACTOR;
  const ageDays = Math.max(0, (asOfMs - evidenceMs) / 86_400_000);
  return round4(Math.max(MIN_RECENCY_FACTOR, Math.min(1, Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS))));
}

const PRICING_RE = /\b(price|pricing|cost|costs|quote|rate|rates|fee|fees|how much)\b|çmim|cmim|kushton|kosto|tarif/i;
const DEMO_RE = /\b(demo|demonstration|book|booking|meeting|appointment|schedule|reserve|reservation)\b|rezerv|takim|termin/i;
const PURCHASE_RE = /\b(buy|purchase|order|checkout|subscribe|sign up|i want it|i'll take it|place an order)\b|blej|blerj|porosi|porosis|dua ta marr|abon/i;
const OBJECTION_RE = /\b(too expensive|expensive|overpriced|can't afford|cannot afford|not worth|too much)\b|shtrenjt|shume kushton|shumë kushton|nuk ia vlen/i;
const SUPPORT_RE = /\b(help|support|problem|issue|broken|bug|error|refund|cancel|cancellation|not working)\b|ndihm|problem|gabim|rimburs|anuloj|nuk punon/i;

export function classifyContentSignals(content: string | null | undefined): IntentEvidenceType[] {
  const text = (content ?? "").trim();
  if (!text) return [];
  const out: IntentEvidenceType[] = [];
  const pricing = PRICING_RE.test(text);
  const demo = DEMO_RE.test(text);
  const purchase = PURCHASE_RE.test(text);
  const objection = OBJECTION_RE.test(text);
  const support = SUPPORT_RE.test(text);
  if (pricing) out.push("pricing_inquiry");
  if (demo) out.push("demo_booking_request");
  if (purchase) out.push("purchase_related_language");
  if (objection) out.push("objection_signal");
  if (support && !pricing && !demo && !purchase) out.push("support_only_language");
  return out;
}

function evidence(
  type: IntentEvidenceType,
  timestamp: string,
  sourceRef: string,
  asOf: string,
  refs: Pick<RuntimeEvidence, "engagement_event_id" | "interest_memory_id">,
): RuntimeEvidence {
  return {
    evidence_type: type,
    direction: EVIDENCE_DIRECTIONS[type],
    weight: EVIDENCE_WEIGHTS[type],
    recency_factor: computeRecencyFactor(timestamp, asOf),
    evidence_timestamp: timestamp,
    source_ref: sourceRef,
    ...refs,
  };
}

export function extractEvidenceFromEvent(event: RuntimeEngagementEvent, asOf: string): RuntimeEvidence[] {
  if (event.event_type !== "message_received") return [];
  const out = [evidence("inbound_message", event.event_timestamp, event.source_ref, asOf, { engagement_event_id: event.id })];
  for (const type of classifyContentSignals(event.content_ref)) {
    out.push(evidence(type, event.event_timestamp, event.source_ref, asOf, { engagement_event_id: event.id }));
  }
  return out;
}

export function extractEvidenceFromInterestMemory(rows: RuntimeInterestMemory[], asOf: string): RuntimeEvidence[] {
  const out: RuntimeEvidence[] = [];
  for (const row of rows) {
    if (!row.id || row.state !== "active") continue;
    if (row.interest_type !== "product" && row.interest_type !== "service") continue;
    const source = `interest:${row.interest_type}:${row.interest_ref}`;
    out.push(evidence("explicit_product_interest", row.last_seen_at, source, asOf, { interest_memory_id: row.id }));
    if (row.evidence_count >= 2) {
      out.push(evidence("repeated_interest_signal", row.last_seen_at, source, asOf, { interest_memory_id: row.id }));
    }
  }
  return out;
}

export function buildEvidenceIdempotencyKey(
  workspaceId: string,
  identityKey: string,
  item: Pick<RuntimeEvidence, "evidence_type" | "engagement_event_id" | "interest_memory_id" | "source_ref">,
): string {
  const source = item.engagement_event_id
    ? `event:${item.engagement_event_id}`
    : item.interest_memory_id
      ? `memory:${item.interest_memory_id}`
      : `source:${item.source_ref}`;
  return `social-intent:${workspaceId}:${identityKey}:${source}:${item.evidence_type}`;
}

export function toContribution(
  workspaceId: string,
  identityKey: string,
  item: RuntimeEvidence,
): IntentEvidenceContribution & { idempotency_key: string } {
  const magnitude = round4(item.weight * item.recency_factor);
  const contribution = item.direction === "positive" ? magnitude : item.direction === "negative" ? -magnitude : 0;
  return {
    evidence_type: item.evidence_type,
    direction: item.direction,
    weight: item.weight,
    contribution,
    source_ref: item.source_ref,
    evidence_timestamp: item.evidence_timestamp,
    recency_factor: item.recency_factor,
    idempotency_key: buildEvidenceIdempotencyKey(workspaceId, identityKey, item),
  };
}

export function computeIntentScoreLocally(contributions: IntentEvidenceContribution[]): Pick<SocialIntentScore, "score" | "score_band" | "evidence_count" | "confidence"> {
  const raw = contributions.reduce((sum, item) => {
    const magnitude = item.weight * (item.recency_factor ?? 1);
    if (item.direction === "positive") return sum + magnitude;
    if (item.direction === "negative") return sum - magnitude;
    return sum;
  }, 0);
  const score = round4(clamp01(raw));
  return {
    score,
    score_band: scoreToBand(score),
    evidence_count: contributions.length,
    confidence: classifyIntentConfidence(contributions.length),
  };
}
