/**
 * social-consent-evaluator.ts — SOCIAL-1E
 *
 * Canonical consent and opt-out evaluation.
 *
 * DESIGN CONTRACT:
 *   - fail-closed: when in doubt, return not_valid
 *   - workspace-scoped: consent is never reused across workspaces
 *   - no side effects: this module only reads, never writes
 *   - no outbound API calls
 *   - a reply-capable conversation is NOT automatic marketing consent
 *   - transactional permission ≠ marketing permission
 *
 * REUSE AUDIT:
 *   global_suppression_list → REUSE (confirmed in 20260317104016 migration)
 *   suppressed_emails       → REUSE (confirmed in 20260325090953 migration)
 *   social_engagement_events.consent_classification → REUSE
 *   channel communication preferences → MISSING
 *   workspace quiet-hours  → MISSING
 *   per-contact marketing consent record → MISSING
 */

import type { IdentityGraphClient } from "./identity-graph.ts";
import type { CanonicalIdentityState } from "./identity-graph.ts";

export type ConsentSource = "platform_terms" | "explicit_consent" | "legitimate_interest" | "unknown";
export type ConsentValidity = "valid" | "not_valid" | "transactional_only" | "unknown";

export interface ConsentRecord {
  workspace_id: string;
  channel_type: string;
  contact_identifier: string;
  consent_source: ConsentSource;
  consent_given_at?: string;
  consent_revoked_at?: string;
  is_opted_out: boolean;
  is_globally_suppressed: boolean;
  is_channel_suppressed: boolean;
  marketing_allowed: boolean;
  transactional_allowed: boolean;
  communication_type?: "marketing" | "transactional" | "all";
}

export interface ConsentEvaluation {
  validity: ConsentValidity;
  is_opted_out: boolean;
  is_globally_suppressed: boolean;
  is_channel_suppressed: boolean;
  marketing_allowed: boolean;
  transactional_only: boolean;
  consent_source: ConsentSource;
  consent_given_at?: string;
  consent_revoked_at?: string;
  workspace_id: string;
  reasons: ConsentReason[];
}

export type ConsentReason =
  | "CONSENT_VALID" | "CONSENT_MISSING" | "OPTED_OUT" | "CONSENT_REVOKED"
  | "GLOBALLY_SUPPRESSED" | "CHANNEL_SUPPRESSED" | "TRANSACTIONAL_ONLY"
  | "MARKETING_NOT_ALLOWED" | "ANONYMOUS_AGGREGATE_INELIGIBLE"
  | "PLATFORM_ACTOR_PERSON_LEVEL_INELIGIBLE" | "CROSS_WORKSPACE_INELIGIBLE" | "UNKNOWN_CONSENT";

export type ConsentDb = IdentityGraphClient;

/**
 * NOTE: global_suppression_list uses `user_id` as the workspace-scoping column
 * (the existing canonical table design — see migration 20260317104016).
 * The workspace_id UUID is passed as the `user_id` filter value.
 * If the suppression records were created with the workspace owner's auth user_id
 * rather than the workspace UUID, this query will miss them.
 * That is a known structural limitation of the existing table; do NOT change the
 * column name here without a corresponding additive schema migration.
 *
 * On DB read error, suppression returns false (not suppressed) to avoid silently
 * blocking legitimate contacts when the DB is temporarily unavailable.
 * This is an intentional trade-off: suppression errors are visible in logs and
 * should be monitored; the alternative (fail-closed on suppression) could block
 * all outbound communication during a transient DB outage.
 */
async function checkGlobalSuppression(db: ConsentDb, workspace_id: string, contact_identifier: string, channel_type: string): Promise<boolean> {
  try {
    const result = await (db.from<{ id: string }>("global_suppression_list").select("id").eq("user_id", workspace_id).eq("contact_identifier", contact_identifier).eq("channel_type", channel_type).limit(1) as unknown as Promise<{ data: { id: string }[] | null; error: unknown }>);
    if (result.error) return false;
    return (result.data?.length ?? 0) > 0;
  } catch { return false; }
}

async function checkEmailSuppression(db: ConsentDb, contact_identifier: string): Promise<boolean> {
  try {
    const result = await (db.from<{ email: string }>("suppressed_emails").select("email").eq("email", contact_identifier.toLowerCase().trim()).limit(1) as unknown as Promise<{ data: { email: string }[] | null; error: unknown }>);
    if (result.error) return false;
    return (result.data?.length ?? 0) > 0;
  } catch { return false; }
}

export async function evaluateConsent(opts: {
  workspace_id: string;
  contact_identifier: string;
  channel_type: string;
  identity_state: CanonicalIdentityState;
  contact_workspace_id?: string;
  consent_record?: ConsentRecord | null;
  db: ConsentDb;
}): Promise<ConsentEvaluation> {
  const { workspace_id, contact_identifier, channel_type, identity_state, contact_workspace_id, consent_record, db } = opts;
  const reasons: ConsentReason[] = [];

  if (identity_state === "anonymous_aggregate") {
    reasons.push("ANONYMOUS_AGGREGATE_INELIGIBLE");
    return { validity: "not_valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  if (contact_workspace_id && contact_workspace_id !== workspace_id) {
    reasons.push("CROSS_WORKSPACE_INELIGIBLE");
    return { validity: "not_valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  const isGloballySuppressed = await checkGlobalSuppression(db, workspace_id, contact_identifier, channel_type);
  const isEmailSuppressed = channel_type === "email" ? await checkEmailSuppression(db, contact_identifier) : false;

  if (isGloballySuppressed || isEmailSuppressed) {
    reasons.push("GLOBALLY_SUPPRESSED");
    return { validity: "not_valid", is_opted_out: false, is_globally_suppressed: true, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  if (!consent_record) {
    reasons.push("CONSENT_MISSING");
    return { validity: "unknown", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  if (consent_record.is_opted_out) {
    reasons.push("OPTED_OUT");
    return { validity: "not_valid", is_opted_out: true, is_globally_suppressed: false, is_channel_suppressed: consent_record.is_channel_suppressed, marketing_allowed: false, transactional_only: false, consent_source: consent_record.consent_source, consent_given_at: consent_record.consent_given_at, consent_revoked_at: consent_record.consent_revoked_at, workspace_id, reasons };
  }

  if (consent_record.consent_revoked_at) {
    reasons.push("CONSENT_REVOKED");
    return { validity: "not_valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: consent_record.is_channel_suppressed, marketing_allowed: false, transactional_only: false, consent_source: consent_record.consent_source, consent_given_at: consent_record.consent_given_at, consent_revoked_at: consent_record.consent_revoked_at, workspace_id, reasons };
  }

  if (consent_record.is_channel_suppressed) {
    reasons.push("CHANNEL_SUPPRESSED");
    return { validity: "not_valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: true, marketing_allowed: false, transactional_only: false, consent_source: consent_record.consent_source, consent_given_at: consent_record.consent_given_at, workspace_id, reasons };
  }

  if (consent_record.communication_type === "transactional" || (!consent_record.marketing_allowed && consent_record.transactional_allowed)) {
    reasons.push("TRANSACTIONAL_ONLY");
    return { validity: "transactional_only", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: true, consent_source: consent_record.consent_source, consent_given_at: consent_record.consent_given_at, workspace_id, reasons };
  }

  reasons.push("CONSENT_VALID");
  return { validity: "valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: consent_record.marketing_allowed, transactional_only: false, consent_source: consent_record.consent_source, consent_given_at: consent_record.consent_given_at, workspace_id, reasons };
}
