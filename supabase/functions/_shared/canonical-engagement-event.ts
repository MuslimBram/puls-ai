/**
 * canonical-engagement-event.ts  — SOCIAL-1A
 *
 * Canonical normalized social engagement event model.
 *
 * IDENTITY STATES (four; never collapse):
 *   known_person       — first-party identity confirmed by lawful linkage
 *   platform_actor     — provider-scoped ID available; no first-party link yet
 *   pseudonymous_visitor — first-party pseudonymous token; no real-world identity
 *   anonymous_aggregate  — no individual identity; aggregate signal only
 *
 * NEVER promote anonymous_aggregate → any identified state.
 * NEVER promote platform_actor → known_person without explicit lawful linkage
 * (SOCIAL-1B territory; not implemented here).
 *
 * EVENT TAXONOMY (foundational; not all types have live ingestion yet):
 *   LIVE (connected to real ingestion):
 *     message_received   — inbound DM / message to the workspace account
 *   STRUCTURAL CAPABILITY (defined; NOT yet connected to live ingestion):
 *     message_sent       — outbound message from the workspace account (no live path in SOCIAL-1A)
 *     comment            — comment on a post
 *     reaction           — emoji reaction to a post or message
 *     mention            — mention of the workspace account
 *     share              — content share event
 *     view_aggregate     — aggregate view count signal (anonymous_aggregate only)
 *     click              — link click signal
 */

// ── Identity state ────────────────────────────────────────────────────────────

export type IdentityState =
  | "known_person"          // first-party confirmed
  | "platform_actor"        // provider-scoped ID; no first-party link
  | "pseudonymous_visitor"  // first-party pseudonymous token
  | "anonymous_aggregate";  // no individual identity

// ── Event taxonomy ────────────────────────────────────────────────────────────

/** LIVE: connected to real ingestion in SOCIAL-1A. */
export type LiveEngagementEventType = "message_received";

/**
 * STRUCTURAL CAPABILITY: defined for taxonomy completeness but NOT yet connected
 * to any live ingestion path. Marked here to prevent accidental live use.
 *
 * message_sent is STRUCTURAL only — no outbound ingestion path exists in SOCIAL-1A.
 * Promote to LiveEngagementEventType only when a real outbound path is wired.
 */
export type StructuralCapabilityEventType =
  | "message_sent"
  | "comment"
  | "reaction"
  | "mention"
  | "share"
  | "view_aggregate"
  | "click";

export type EngagementEventType = LiveEngagementEventType | StructuralCapabilityEventType;

// ── Provider / platform ───────────────────────────────────────────────────────

/** Supported provider identifiers. Extend here only when real ingestion exists. */
export type EngagementProvider =
  | "meta_ig"   // Instagram DM (LIVE in SOCIAL-1A)
  | "meta_fb";  // Facebook Messenger (LIVE in SOCIAL-1A)

// ── Canonical engagement event ────────────────────────────────────────────────

/**
 * Canonical normalized social engagement event.
 * All fields are explicitly typed; no loose "any".
 */
export interface CanonicalEngagementEvent {
  /** Workspace that owns this event. Mandatory; fail closed if absent. */
  workspace_id: string;

  /** Internal channel row that received the event. */
  channel_id: string;

  /** Provider / platform that originated the event. */
  provider: EngagementProvider;

  /** Platform-level account identifier (page_id, ig_account_id, etc.). */
  account_identifier: string;

  /** Normalized event type from the taxonomy above. */
  event_type: EngagementEventType;

  /** Provider's own stable event/message identifier. Used for idempotency. */
  provider_event_id: string;

  /**
   * Provider-scoped actor identifier when legally/API available.
   * Null when identity is unavailable (anonymous_aggregate state).
   * MUST NOT be treated as a first-party identity.
   */
  actor_provider_id: string | null;

  /** Identity state of the actor. Never demote anonymous_aggregate. */
  actor_identity_state: IdentityState;

  /**
   * True when the event represents an aggregate signal with no
   * individual identity (e.g. view_aggregate, click aggregate).
   * When true, actor_provider_id MUST be null.
   */
  is_anonymous_aggregate: boolean;

  /**
   * Normalized message/content reference.
   * Sanitized snippet or attachment placeholder; never raw provider payload.
   */
  content_ref: string | null;

  /** Provider-reported event timestamp (ISO-8601). */
  event_timestamp: string;

  /** Normalized metadata safe for storage (no secrets, no raw tokens). */
  normalized_metadata: Record<string, unknown>;

  /**
   * Consent / policy classification where applicable.
   * "platform_terms" — covered by platform terms of service only.
   * "explicit_consent" — user gave explicit consent.
   * "legitimate_interest" — legitimate interest basis.
   * null — not yet classified.
   */
  consent_classification: "platform_terms" | "explicit_consent" | "legitimate_interest" | null;

  /**
   * Opaque reference to the source raw event for audit purposes.
   * MUST NOT include secrets, tokens, or full raw payloads.
   * Format: "<provider>:<event_id>" — sufficient for a cross-reference lookup.
   */
  source_ref: string;

  /**
   * Idempotency key scoped to workspace + provider + event.
   * Format: "seg:<provider>:<workspace_id>:<provider_event_id>"
   */
  idempotency_key: string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export interface BuildCanonicalEngagementEventInput {
  workspace_id: string;
  channel_id: string;
  provider: EngagementProvider;
  account_identifier: string;
  event_type: EngagementEventType;
  provider_event_id: string;
  actor_provider_id: string | null;
  /** Defaults to "platform_actor" when actor_provider_id is set; "anonymous_aggregate" otherwise. */
  actor_identity_state?: IdentityState;
  content_ref: string | null;
  event_timestamp?: string;
  normalized_metadata?: Record<string, unknown>;
  consent_classification?: CanonicalEngagementEvent["consent_classification"];
}

/**
 * Builds a validated canonical engagement event.
 * Enforces identity-state invariants so callers cannot accidentally
 * create an anonymous event with an actor ID.
 */
export function buildCanonicalEngagementEvent(
  input: BuildCanonicalEngagementEventInput,
): CanonicalEngagementEvent {
  const isAnonymous = !input.actor_provider_id;

  // Derive identity state from explicit override or sensible default
  let identityState: IdentityState;
  if (input.actor_identity_state) {
    identityState = input.actor_identity_state;
  } else {
    identityState = isAnonymous ? "anonymous_aggregate" : "platform_actor";
  }

  // Invariant: known_person is NOT creatable in SOCIAL-1A.
  // Lawful first-party identity linkage belongs to SOCIAL-1B (not implemented).
  // Reject here so no code path can accidentally manufacture a known_person event.
  if (identityState === "known_person") {
    throw new Error(
      "canonical-engagement-event: identity_state=known_person requires a lawful first-party linkage " +
      "that is not implemented in SOCIAL-1A — this is SOCIAL-1B territory",
    );
  }

  // Invariant: platform_actor MUST have a provider-scoped actor ID.
  // If the sender is unknown, fail closed to anonymous_aggregate rather than
  // manufacturing a platform_actor with no real identity.
  if (identityState === "platform_actor" && !input.actor_provider_id) {
    throw new Error(
      "canonical-engagement-event: identity_state=platform_actor requires a non-null actor_provider_id " +
      "(provider-scoped sender ID). Use anonymous_aggregate when sender identity is unavailable.",
    );
  }

  // Invariant: anonymous_aggregate MUST NOT have an actor ID
  if (identityState === "anonymous_aggregate" && input.actor_provider_id) {
    throw new Error(
      "canonical-engagement-event: identity_state=anonymous_aggregate is incompatible with a non-null actor_provider_id",
    );
  }

  // Invariant: pseudonymous_visitor MUST have an actor ID (it is a first-party pseudonymous token)
  if (identityState === "pseudonymous_visitor" && !input.actor_provider_id) {
    throw new Error(
      "canonical-engagement-event: identity_state=pseudonymous_visitor requires a non-null actor_provider_id",
    );
  }

  const provider_event_id = input.provider_event_id;
  const idempotency_key = `seg:${input.provider}:${input.workspace_id}:${provider_event_id}`;
  const source_ref = `${input.provider}:${provider_event_id}`;

  return {
    workspace_id: input.workspace_id,
    channel_id: input.channel_id,
    provider: input.provider,
    account_identifier: input.account_identifier,
    event_type: input.event_type,
    provider_event_id,
    actor_provider_id: isAnonymous ? null : (input.actor_provider_id ?? null),
    actor_identity_state: identityState,
    is_anonymous_aggregate: identityState === "anonymous_aggregate",
    content_ref: input.content_ref,
    event_timestamp: input.event_timestamp ?? new Date().toISOString(),
    normalized_metadata: input.normalized_metadata ?? {},
    consent_classification: input.consent_classification ?? "platform_terms",
    source_ref,
    idempotency_key,
  };
}
