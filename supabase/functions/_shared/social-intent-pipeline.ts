import { resolveIdentity, type IdentityGraphClient } from "./identity-graph.ts";
import type { CanonicalEngagementRow } from "./social-interest-memory.ts";
import { processIntentScore, type SocialIntentDb } from "./social-intent-runtime.ts";
import { observeJourneyFromIntentScore } from "./social-intent-journey.ts";

export interface SocialIntentPipelineResult {
  status:
    | "processed"
    | "skipped_non_live_event"
    | "skipped_anonymous"
    | "skipped_ambiguous"
    | "skipped_no_evidence"
    | "not_found"
    | "error";
  evidence_inserted: number;
  journey_status?: string;
}

type PipelineDb = IdentityGraphClient & SocialIntentDb;

async function findSingleLinkedCustomer(
  db: PipelineDb,
  workspaceId: string,
  canonicalPersonId: string,
): Promise<{ customer_id: string; business_id: string } | null> {
  const links = await (db
    .from<any>("identity_links")
    .select("identity_node_id")
    .eq("workspace_id", workspaceId)
    .eq("canonical_person_id", canonicalPersonId)
    .eq("is_revoked", false)
    .eq("confidence", "deterministic") as unknown as Promise<{ data: Array<{ identity_node_id: string }> | null; error: any }>);
  if (links.error || !links.data?.length) return null;

  const customerIds = new Set<string>();
  for (const link of links.data) {
    const node = await db
      .from<any>("identity_nodes")
      .select("external_id")
      .eq("id", link.identity_node_id)
      .eq("workspace_id", workspaceId)
      .eq("node_type", "crm_contact")
      .limit(1)
      .single();
    if (!node.error && node.data?.external_id) customerIds.add(String(node.data.external_id));
  }
  if (customerIds.size !== 1) return null;

  const customerId = [...customerIds][0];
  const customer = await db
    .from<any>("customers")
    .select("id,business_id")
    .eq("id", customerId)
    .limit(1)
    .single();
  if (customer.error || !customer.data?.id || !customer.data?.business_id) return null;
  return { customer_id: String(customer.data.id), business_id: String(customer.data.business_id) };
}

export async function processIntentFromCanonicalEvent(
  db: PipelineDb,
  event: CanonicalEngagementRow,
  asOf = new Date().toISOString(),
): Promise<SocialIntentPipelineResult> {
  if (event.event_type !== "message_received") {
    return { status: "skipped_non_live_event", evidence_inserted: 0 };
  }
  if (event.is_anonymous_aggregate || event.actor_identity_state === "anonymous_aggregate" || !event.actor_provider_id) {
    return { status: "skipped_anonymous", evidence_inserted: 0 };
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

  const canonicalPersonId = identity.canonical_state === "known_person"
    ? identity.canonical_person_id ?? undefined
    : undefined;
  const identityState = canonicalPersonId
    ? "known_person"
    : event.actor_identity_state === "pseudonymous_visitor"
      ? "pseudonymous_visitor"
      : "platform_actor";
  const identityKey = canonicalPersonId
    ? `person:${canonicalPersonId}`
    : `actor:${event.provider}:${event.account_identifier}:${event.actor_provider_id.toLowerCase().trim()}`;

  const memoryResult = await (db
    .from<any>("social_interest_memory")
    .select("id,interest_type,interest_ref,evidence_count,strength,first_seen_at,last_seen_at,state")
    .eq("workspace_id", event.workspace_id)
    .eq("resolved_identity_key", identityKey)
    .eq("state", "active") as unknown as Promise<{ data: any[] | null; error: any }>);
  if (memoryResult.error) return { status: "error", evidence_inserted: 0 };

  const scoring = await processIntentScore({
    workspace_id: event.workspace_id,
    resolved_identity_key: identityKey,
    canonical_person_id: canonicalPersonId,
    identity_state: identityState,
    interest_memory_rows: memoryResult.data ?? [],
    engagement_events: [{
      id: event.id,
      event_type: event.event_type,
      content_ref: event.content_ref,
      event_timestamp: event.event_timestamp,
      source_ref: event.source_ref,
    }],
    as_of: asOf,
  }, db);

  if (scoring.status === "error") return { status: "error", evidence_inserted: scoring.evidence_inserted };
  if (scoring.status === "skipped_no_evidence") return { status: "skipped_no_evidence", evidence_inserted: 0 };
  if (scoring.status === "skipped_anonymous") return { status: "skipped_anonymous", evidence_inserted: 0 };
  if (!scoring.score) return { status: "error", evidence_inserted: scoring.evidence_inserted };

  let journeyStatus: string | undefined;
  if (identityState === "known_person" && canonicalPersonId) {
    const linkedCustomer = await findSingleLinkedCustomer(db, event.workspace_id, canonicalPersonId);
    if (linkedCustomer) {
      const journey = await observeJourneyFromIntentScore({
        workspace_id: event.workspace_id,
        resolved_identity_key: identityKey,
        canonical_person_id: canonicalPersonId,
        intent_score: scoring.score,
        business_id: linkedCustomer.business_id,
        customer_id: linkedCustomer.customer_id,
      }, db);
      journeyStatus = journey.status;
      if (journey.status === "error") {
        return { status: "error", evidence_inserted: scoring.evidence_inserted, journey_status: journey.status };
      }
    }
  }

  return {
    status: "processed",
    evidence_inserted: scoring.evidence_inserted,
    journey_status: journeyStatus,
  };
}

export async function processIntentFromCanonicalEventId(
  db: PipelineDb,
  engagementEventId: string,
  asOf = new Date().toISOString(),
): Promise<SocialIntentPipelineResult> {
  const event = await db
    .from<CanonicalEngagementRow>("social_engagement_events")
    .select(
      "id, workspace_id, provider, account_identifier, event_type, actor_provider_id, actor_identity_state, is_anonymous_aggregate, content_ref, event_timestamp, source_ref, normalized_metadata",
    )
    .eq("id", engagementEventId)
    .limit(1)
    .single();
  if (event.error || !event.data) return { status: "not_found", evidence_inserted: 0 };
  return processIntentFromCanonicalEvent(db, event.data, asOf);
}
