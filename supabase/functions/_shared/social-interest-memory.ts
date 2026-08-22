import { resolveIdentity, type IdentityGraphClient } from "./identity-graph.ts";
import { processIntentFromCanonicalEvent } from "./social-intent-pipeline.ts";

export type InterestType = "topic" | "category" | "product" | "service";

export interface CanonicalEngagementRow {
  id: string;
  workspace_id: string;
  provider: string;
  account_identifier: string;
  event_type: string;
  actor_provider_id: string | null;
  actor_identity_state: "known_person" | "platform_actor" | "pseudonymous_visitor" | "anonymous_aggregate";
  is_anonymous_aggregate: boolean;
  content_ref: string | null;
  event_timestamp: string;
  source_ref: string;
  normalized_metadata?: Record<string, unknown>;
}

interface InterestSignal {
  interest_type: InterestType;
  interest_ref: string;
  evidence_type: string;
}

export interface SocialInterestProcessResult {
  status:
    | "processed"
    | "skipped_non_live_event"
    | "skipped_anonymous"
    | "skipped_ambiguous"
    | "skipped_no_interest"
    | "not_found"
    | "error";
  evidence_inserted: number;
}

interface InterestAccumulationRpcResult {
  evidence_inserted: boolean;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "are", "was", "were", "have",
  "has", "had", "about", "please", "need", "want", "would", "could", "should", "can", "just", "what",
  "when", "where", "how", "why", "than", "then", "them", "they", "their", "our", "ours", "into", "onto",
  "also", "very", "more", "most", "much", "many", "some", "any", "all", "new", "get", "got", "like",
  "interested", "pricing", "price", "hello", "thanks", "thank", "hi",
]);

function normalizeToken(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
}

export function extractInterestSignals(content: string | null): InterestSignal[] {
  if (!content) return [];

  const normalized = content.toLowerCase();
  const out = new Map<string, InterestSignal>();

  const typed = /\b(product|service|category|topic)\s+([a-z0-9][a-z0-9_-]{1,63})\b/g;
  for (const m of normalized.matchAll(typed)) {
    const interest_type = m[1] as InterestType;
    const interest_ref = normalizeToken(m[2]);
    if (!interest_ref) continue;
    out.set(`${interest_type}:${interest_ref}`, {
      interest_type,
      interest_ref,
      evidence_type: "explicit_keyword",
    });
  }

  const tokens = normalized
    .split(/[^a-z0-9_-]+/)
    .map(normalizeToken)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));

  for (const token of tokens.slice(0, 4)) {
    out.set(`topic:${token}`, {
      interest_type: "topic",
      interest_ref: token,
      evidence_type: "message_topic_token",
    });
  }

  return [...out.values()];
}

async function findIdentityNodeId(
  db: IdentityGraphClient,
  workspace_id: string,
  provider: string,
  account_identifier: string,
  actor_provider_id: string,
): Promise<string | null> {
  const result = await db
    .from<{ id: string }>("identity_nodes")
    .select("id")
    .eq("workspace_id", workspace_id)
    .eq("node_type", "provider_actor")
    .eq("provider", provider)
    .eq("provider_scope", account_identifier)
    .eq("normalized_value", actor_provider_id.toLowerCase().trim())
    .limit(1)
    .single();

  if (result.error || !result.data) return null;
  return result.data.id;
}

async function revokeMismatchedKnownPersonRows(
  db: IdentityGraphClient,
  workspace_id: string,
  provider: string,
  account_identifier: string,
  actor_provider_id: string,
  activeResolvedIdentityKey: string,
): Promise<void> {
  const existing = await (db
    .from<any>("social_interest_memory")
    .select("id, canonical_person_id, resolved_identity_key, state")
    .eq("workspace_id", workspace_id)
    .eq("provider", provider)
    .eq("account_identifier", account_identifier)
    .eq("actor_provider_id", actor_provider_id)
    .eq("state", "active") as unknown as Promise<{ data: any[] | null; error: { message: string } | null }>);

  if (existing.error || !existing.data?.length) return;

  for (const row of existing.data) {
    if (!row.canonical_person_id) continue;
    if (row.resolved_identity_key === activeResolvedIdentityKey) continue;

    await db
      .from("social_interest_memory")
      .update({
        state: "revoked",
        revoked_at: new Date().toISOString(),
        revocation_reason: "identity_resolution_changed",
      })
      .eq("id", row.id)
      .eq("workspace_id", workspace_id);
  }
}

export async function processInterestFromEngagementEvent(
  db: IdentityGraphClient,
  event: CanonicalEngagementRow,
): Promise<SocialInterestProcessResult> {
  if (event.event_type !== "message_received") {
    return { status: "skipped_non_live_event", evidence_inserted: 0 };
  }

  if (event.is_anonymous_aggregate || event.actor_identity_state === "anonymous_aggregate" || !event.actor_provider_id) {
    return { status: "skipped_anonymous", evidence_inserted: 0 };
  }

  const signals = extractInterestSignals(event.content_ref);
  if (!signals.length) {
    return { status: "skipped_no_interest", evidence_inserted: 0 };
  }

  const identity = await resolveIdentity(
    event.workspace_id,
    event.provider,
    event.account_identifier,
    event.actor_provider_id,
    db,
  );

  if (identity.outcome === "ambiguous") {
    return { status: "skipped_ambiguous", evidence_inserted: 0 };
  }

  const canonical_person_id = identity.canonical_state === "known_person" ? identity.canonical_person_id ?? null : null;
  const resolved_identity_key = canonical_person_id
    ? `person:${canonical_person_id}`
    : `actor:${event.provider}:${event.account_identifier}:${event.actor_provider_id.toLowerCase().trim()}`;

  const effectiveState = canonical_person_id
    ? "known_person"
    : (event.actor_identity_state === "pseudonymous_visitor" ? "pseudonymous_visitor" : "platform_actor");

  await revokeMismatchedKnownPersonRows(
    db,
    event.workspace_id,
    event.provider,
    event.account_identifier,
    event.actor_provider_id,
    resolved_identity_key,
  );

  const identity_node_id = await findIdentityNodeId(
    db,
    event.workspace_id,
    event.provider,
    event.account_identifier,
    event.actor_provider_id,
  );

  let evidenceInserted = 0;

  for (const signal of signals) {
    const accumulation = await db.rpc<InterestAccumulationRpcResult>("accumulate_social_interest_signal", {
      p_workspace_id: event.workspace_id,
      p_engagement_event_id: event.id,
      p_provider: event.provider,
      p_account_identifier: event.account_identifier,
      p_actor_provider_id: event.actor_provider_id,
      p_interest_type: signal.interest_type,
      p_interest_ref: signal.interest_ref,
      p_evidence_type: signal.evidence_type,
      p_evidence_timestamp: event.event_timestamp,
      p_source_provider: event.provider,
      p_source_ref: event.source_ref,
      p_canonical_person_id: canonical_person_id,
      p_identity_node_id: identity_node_id,
      p_actor_identity_state: effectiveState,
      p_resolved_identity_key: resolved_identity_key,
    });

    if (accumulation.error || !accumulation.data) {
      return { status: "error", evidence_inserted: evidenceInserted };
    }

    if (accumulation.data.evidence_inserted) {
      evidenceInserted++;
    }
  }

  return { status: "processed", evidence_inserted: evidenceInserted };
}

export async function processInterestFromEngagementEventId(
  db: IdentityGraphClient,
  engagement_event_id: string,
): Promise<SocialInterestProcessResult> {
  const event = await db
    .from<CanonicalEngagementRow>("social_engagement_events")
    .select(
      "id, workspace_id, provider, account_identifier, event_type, actor_provider_id, actor_identity_state, is_anonymous_aggregate, content_ref, event_timestamp, source_ref, normalized_metadata",
    )
    .eq("id", engagement_event_id)
    .limit(1)
    .single();

  if (event.error || !event.data) {
    return { status: "not_found", evidence_inserted: 0 };
  }

  const interestResult = await processInterestFromEngagementEvent(db, event.data);
  if (interestResult.status === "error") return interestResult;

  // SOCIAL-1D: this helper is already the canonical post-engagement pipeline
  // used by meta-webhook. Run intent only AFTER SOCIAL-1C has had the chance to
  // persist/update Interest Memory, so scoring sees the canonical current state.
  // Any transient intent/Journey persistence failure returns error, causing the
  // provider webhook path to retry. All SOCIAL-1D writes are idempotent.
  const intentResult = await processIntentFromCanonicalEvent(db as any, event.data);
  if (intentResult.status === "error") {
    return { status: "error", evidence_inserted: interestResult.evidence_inserted };
  }

  return interestResult;
}
