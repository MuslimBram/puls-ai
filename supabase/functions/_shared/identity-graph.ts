/**
 * identity-graph.ts  — SOCIAL-1B
 *
 * Canonical workspace-scoped identity resolution service.
 *
 * DESIGN CONTRACT:
 *   - deterministic: same inputs always produce the same output
 *   - workspace-scoped: resolution is strictly per-workspace; no cross-tenant joins
 *   - fail-closed: ambiguous matches → no merge; returns 'platform_actor'
 *   - no first-match: requires exactly one unambiguous canonical person
 *   - no cross-workspace resolution: provider actor in workspace A cannot
 *     resolve to a person in workspace B
 *   - no global unique constraints connect tenants
 *
 * LINKAGE EVIDENCE CONTRACT:
 *   Every call to createVerifiedLink() must supply LinkageEvidence.
 *   The DB trigger (trg_social_engagement_known_person_evidence) independently
 *   enforces the same contract at the database layer.
 *
 * FOUR CANONICAL IDENTITY STATES:
 *   known_person       — deterministic, non-revoked link to a canonical_person
 *   platform_actor     — provider-scoped ID exists; no verified link
 *   pseudonymous_visitor — first-party pseudonymous token; no real-world identity
 *   anonymous_aggregate  — no individual identity; null actor_provider_id
 *
 * NEVER:
 *   - promote anonymous_aggregate to any identified state
 *   - merge on fuzzy name match
 *   - use IP address, passive hardware signals, or behavioral similarity for promotion
 *   - cross-workspace identity resolution
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CanonicalIdentityState =
  | "known_person"
  | "platform_actor"
  | "pseudonymous_visitor"
  | "anonymous_aggregate";

/** Internal resolution states including fail-closed outcomes. */
export type ResolutionOutcome =
  | CanonicalIdentityState
  | "ambiguous"    // multiple canonical persons matched → fail closed
  | "unresolved";  // no node registered → call site defaults to platform_actor

export type NodeType =
  | "provider_actor"
  | "email"
  | "phone"
  | "pseudonymous_token"
  | "crm_contact";

/**
 * Allowed deterministic linkage types.
 * Fuzzy / probabilistic methods are NOT in this list and MUST NOT be added.
 */
export type LinkageType =
  | "authenticated_account"
  | "verified_email"
  | "verified_phone"
  | "crm_match"
  | "provider_verified"
  | "explicit_confirmation";

/** Machine-readable evidence that must accompany every linkage. */
export interface LinkageEvidence {
  linkage_type:           LinkageType;
  verified_identifier:    string;     // what was actually verified
  source_system:          string;     // system that produced the evidence
  verification_timestamp: string;     // ISO 8601
}

export interface IdentityNode {
  id:               string;
  workspace_id:     string;
  node_type:        NodeType;
  provider?:        string;
  provider_scope?:  string;
  external_id:      string;
  normalized_value: string;
  created_at:       string;
  updated_at:       string;
}

export interface IdentityLink {
  id:                     string;
  workspace_id:           string;
  canonical_person_id:    string;
  identity_node_id:       string;
  linkage_type:           LinkageType;
  verified_identifier:    string;
  source_system:          string;
  verification_timestamp: string;
  confidence:             "deterministic" | "probabilistic";
  is_revoked:             boolean;
  revoked_at?:            string;
  revocation_reason?:     string;
  created_at:             string;
  updated_at:             string;
}

export interface CanonicalPerson {
  id:            string;
  workspace_id:  string;
  display_label?: string;
  created_at:    string;
  updated_at:    string;
}

export interface IdentityResolutionResult {
  outcome:             ResolutionOutcome;
  /** The final canonical state the caller should use (never 'ambiguous' or 'unresolved'). */
  canonical_state:     CanonicalIdentityState;
  canonical_person_id?: string;   // set only when outcome === 'known_person'
  workspace_id:        string;
  provider?:           string;
  actor_provider_id?:  string;
}

// ── Minimal Supabase client interface ────────────────────────────────────────
// (Avoids hard-coupling to @supabase/supabase-js import chain in shared code)

interface SupabaseSingleResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

interface SupabaseQueryBuilder<T> {
  select(columns?: string): SupabaseFilterBuilder<T>;
  insert(values: Partial<T> | Partial<T>[], opts?: { onConflict?: string }): SupabaseFilterBuilder<T>;
  update(values: Partial<T>): SupabaseFilterBuilder<T>;
}

interface SupabaseFilterBuilder<T> {
  eq(column: string, value: unknown): SupabaseFilterBuilder<T>;
  is(column: string, value: null): SupabaseFilterBuilder<T>;
  single(): Promise<SupabaseSingleResult<T>>;
  limit(n: number): SupabaseFilterBuilder<T>;
  then<TResult>(
    onfulfilled: (value: { data: T[] | null; error: { message: string } | null }) => TResult,
  ): Promise<TResult>;
}

export interface IdentityGraphClient {
  from<T = unknown>(table: string): SupabaseQueryBuilder<T>;
  rpc<T = unknown>(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<SupabaseSingleResult<T>>;
}

// ── Core resolution function ──────────────────────────────────────────────────

/**
 * Resolve the canonical identity state for a given (workspace, provider, actor).
 *
 * This is the SINGLE canonical identity-resolution primitive.
 * All adapters and future providers MUST go through this function.
 *
 * Behaviour contract:
 *   - null actor_provider_id → always 'anonymous_aggregate'
 *   - no identity node registered → 'platform_actor' (fail-open default for provider actors)
 *   - node registered, zero valid deterministic links → 'platform_actor'
 *   - node registered, exactly one valid deterministic link → 'known_person'
 *   - node registered, multiple valid deterministic links → 'ambiguous' → fail closed → 'platform_actor'
 *   - any DB error → fail closed → 'platform_actor'
 */
export async function resolveIdentity(
  workspace_id:      string,
  provider:          string,
  account_identifier: string,
  actor_provider_id: string | null,
  db:                IdentityGraphClient,
): Promise<IdentityResolutionResult> {
  // Null actor → anonymous_aggregate; never attempt resolution
  if (!actor_provider_id) {
    return {
      outcome:         "anonymous_aggregate",
      canonical_state: "anonymous_aggregate",
      workspace_id,
      provider,
    };
  }

  try {
    const { data: rawOutcome, error } = await db.rpc<string>("resolve_identity", {
      p_workspace_id:       workspace_id,
      p_provider:           provider,
      p_account_identifier: account_identifier,
      p_actor_provider_id:  actor_provider_id,
    });

    if (error) {
      // DB error → fail closed
      return {
        outcome:         "unresolved",
        canonical_state: "platform_actor",
        workspace_id,
        provider,
        actor_provider_id,
      };
    }

    const outcome = (rawOutcome ?? "unresolved") as ResolutionOutcome;

    // 'unresolved' and 'ambiguous' both fail closed to 'platform_actor'
    const canonical_state: CanonicalIdentityState =
      outcome === "known_person" ? "known_person" :
      outcome === "anonymous_aggregate" ? "anonymous_aggregate" :
      outcome === "pseudonymous_visitor" ? "pseudonymous_visitor" :
      "platform_actor";

    if (outcome !== "known_person") {
      return { outcome, canonical_state, workspace_id, provider, actor_provider_id };
    }

    // Fetch canonical_person_id for the known_person outcome
    const nodeResult = await db
      .from<IdentityNode>("identity_nodes")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("node_type", "provider_actor")
      .eq("provider", provider)
      .eq("provider_scope", account_identifier)
      .eq("normalized_value", actor_provider_id.toLowerCase().trim())
      .limit(1)
      .single();

    if (nodeResult.error || !nodeResult.data) {
      return { outcome: "unresolved", canonical_state: "platform_actor", workspace_id, provider, actor_provider_id };
    }

    const linkResult = await db
      .from<IdentityLink>("identity_links")
      .select("canonical_person_id")
      .eq("workspace_id", workspace_id)
      .eq("identity_node_id", nodeResult.data.id)
      .eq("is_revoked", false)
      .eq("confidence", "deterministic")
      .limit(1)
      .single();

    if (linkResult.error || !linkResult.data) {
      return { outcome: "unresolved", canonical_state: "platform_actor", workspace_id, provider, actor_provider_id };
    }

    return {
      outcome:             "known_person",
      canonical_state:     "known_person",
      canonical_person_id: linkResult.data.canonical_person_id,
      workspace_id,
      provider,
      actor_provider_id,
    };
  } catch {
    // Any exception → fail closed
    return {
      outcome:         "unresolved",
      canonical_state: "platform_actor",
      workspace_id,
      provider,
      actor_provider_id,
    };
  }
}

// ── Create verified link ──────────────────────────────────────────────────────

/**
 * Create a verified identity link.
 *
 * Steps:
 *   1. Upsert the identity_node (idempotent; same node, same workspace).
 *   2. Upsert the canonical_person (or accept an existing one).
 *   3. Insert the identity_link with evidence.
 *
 * A caller MUST supply valid LinkageEvidence.  The DB trigger independently
 * enforces the same contract; this function provides a clear API contract.
 *
 * Returns the canonical_person_id on success.
 * Throws on any validation failure.
 */
export async function createVerifiedLink(opts: {
  workspace_id:         string;
  provider:             string;
  provider_scope:       string;   // account_identifier / page_id
  actor_provider_id:    string;
  evidence:             LinkageEvidence;
  canonical_person_id?: string;   // supply to link to an existing person
  db:                   IdentityGraphClient;
}): Promise<{ canonical_person_id: string; identity_node_id: string; identity_link_id: string }> {
  const { workspace_id, provider, provider_scope, actor_provider_id, evidence, db } = opts;

  if (!workspace_id || !provider || !provider_scope || !actor_provider_id) {
    throw new Error("createVerifiedLink: workspace_id, provider, provider_scope, and actor_provider_id are required");
  }
  if (!evidence.verified_identifier || !evidence.source_system || !evidence.verification_timestamp) {
    throw new Error("createVerifiedLink: evidence.verified_identifier, source_system, and verification_timestamp are required");
  }

  const normalized_value = actor_provider_id.toLowerCase().trim();

  // 1. Upsert identity node
  const nodeUpsert = await db
    .from<IdentityNode>("identity_nodes")
    .insert({
      workspace_id,
      node_type:        "provider_actor",
      provider,
      provider_scope,
      external_id:      actor_provider_id,
      normalized_value,
    }, { onConflict: "workspace_id,node_type,provider,provider_scope,normalized_value" })
    .select("id")
    .single();

  let identity_node_id: string;
  if (nodeUpsert.error || !nodeUpsert.data) {
    // Node may already exist; fetch it
    const existing = await db
      .from<IdentityNode>("identity_nodes")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("node_type", "provider_actor")
      .eq("provider", provider)
      .eq("provider_scope", provider_scope)
      .eq("normalized_value", normalized_value)
      .limit(1)
      .single();

    if (existing.error || !existing.data) {
      throw new Error(`createVerifiedLink: could not create or find identity_node: ${nodeUpsert.error?.message}`);
    }
    identity_node_id = existing.data.id;
  } else {
    identity_node_id = nodeUpsert.data.id;
  }

  // 2. Create or reuse canonical_person
  let canonical_person_id = opts.canonical_person_id ?? null;
  if (!canonical_person_id) {
    const personResult = await db
      .from<CanonicalPerson>("canonical_persons")
      .insert({ workspace_id })
      .select("id")
      .single();

    if (personResult.error || !personResult.data) {
      throw new Error(`createVerifiedLink: could not create canonical_person: ${personResult.error?.message}`);
    }
    canonical_person_id = personResult.data.id;
  }

  // 3. Insert identity_link with evidence
  const linkResult = await db
    .from<IdentityLink>("identity_links")
    .insert({
      workspace_id,
      canonical_person_id,
      identity_node_id,
      linkage_type:           evidence.linkage_type,
      verified_identifier:    evidence.verified_identifier,
      source_system:          evidence.source_system,
      verification_timestamp: evidence.verification_timestamp,
      confidence:             "deterministic",
      is_revoked:             false,
    })
    .select("id")
    .single();

  if (linkResult.error || !linkResult.data) {
    throw new Error(`createVerifiedLink: could not create identity_link: ${linkResult.error?.message}`);
  }

  return {
    canonical_person_id,
    identity_node_id,
    identity_link_id: linkResult.data.id,
  };
}

// ── Revoke link ───────────────────────────────────────────────────────────────

/**
 * Revoke an identity link by ID.
 *
 * Revocation is SOFT: the row is preserved for audit with is_revoked = true.
 * The DB resolve_identity() function and TypeScript resolveIdentity() both
 * filter out revoked links; the actor will revert to 'platform_actor'.
 *
 * Hard-deleting audit evidence is NOT supported here.
 * If privacy architecture requires hard deletion, that must be handled
 * separately via an explicit, logged data-deletion workflow.
 */
export async function revokeIdentityLink(opts: {
  workspace_id:  string;
  link_id:       string;
  reason:        string;
  db:            IdentityGraphClient;
}): Promise<void> {
  const { workspace_id, link_id, reason, db } = opts;

  if (!workspace_id || !link_id || !reason) {
    throw new Error("revokeIdentityLink: workspace_id, link_id, and reason are required");
  }

  const result = await db
    .from<IdentityLink>("identity_links")
    .update({
      is_revoked:        true,
      revoked_at:        new Date().toISOString(),
      revocation_reason: reason,
    })
    .eq("id", link_id)
    .eq("workspace_id", workspace_id)   // workspace-scoped update; prevents cross-tenant revocation
    .select("id")
    .single();

  if (result.error) {
    throw new Error(`revokeIdentityLink: DB error: ${result.error.message}`);
  }
  if (!result.data) {
    throw new Error(`revokeIdentityLink: link ${link_id} not found in workspace ${workspace_id}`);
  }
}

// ── Inspect link evidence ─────────────────────────────────────────────────────

/**
 * Retrieve the evidence for all links associated with a canonical person.
 * Returns only links for the given workspace_id (cross-workspace isolation).
 */
export async function getLinksForPerson(opts: {
  workspace_id:        string;
  canonical_person_id: string;
  include_revoked?:    boolean;
  db:                  IdentityGraphClient;
}): Promise<IdentityLink[]> {
  const { workspace_id, canonical_person_id, include_revoked = false, db } = opts;

  let query = db
    .from<IdentityLink>("identity_links")
    .select()
    .eq("workspace_id", workspace_id)
    .eq("canonical_person_id", canonical_person_id);

  if (!include_revoked) {
    query = query.eq("is_revoked", false);
  }

  const result = await (query as unknown as Promise<{ data: IdentityLink[] | null; error: { message: string } | null }>);
  if (result.error) {
    throw new Error(`getLinksForPerson: DB error: ${result.error.message}`);
  }
  return result.data ?? [];
}
