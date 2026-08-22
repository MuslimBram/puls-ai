/**
 * social-consent-evaluator.ts — SOCIAL-1E
 *
 * Canonical consent and opt-out evaluation.
 *
 * DESIGN CONTRACT:
 *   - fail-closed: when in doubt, return not_valid or unknown
 *   - workspace-scoped: consent is never reused across workspaces
 *   - no side effects: this module only reads, never writes
 *   - no outbound API calls
 *   - a reply-capable conversation is NOT automatic marketing consent
 *   - transactional permission ≠ marketing permission
 *   - suppression DB errors → UNKNOWN/REVIEW, NEVER ALLOW
 *   - consent_record.workspace_id is the authoritative workspace source
 *
 * SUPPRESSION LOOKUP:
 *   Uses the canonical `is_contact_suppressed_for_workspace` RPC (see
 *   migration 20260822190000) which:
 *     - scopes by workspace_id FK (not user_id)
 *     - matches exact channel_type OR 'all'
 *     - covers global_suppression_list AND broadcast_optouts
 *   Do NOT duplicate this logic with direct table queries.
 *
 * REUSE AUDIT:
 *   global_suppression_list → REUSE via is_contact_suppressed_for_workspace RPC
 *   broadcast_optouts       → REUSE via is_contact_suppressed_for_workspace RPC
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
  | "PLATFORM_ACTOR_PERSON_LEVEL_INELIGIBLE" | "CROSS_WORKSPACE_INELIGIBLE"
  | "UNKNOWN_CONSENT" | "SUPPRESSION_CHECK_FAILED";

export type ConsentDb = IdentityGraphClient;

/** 3-state suppression result: avoids boolean ambiguity on DB error. */
type SuppressionState = "suppressed" | "not_suppressed" | "error";

/**
 * Canonical workspace-scoped suppression check.
 *
 * Delegates to the `is_contact_suppressed_for_workspace` SECURITY DEFINER
 * function (migration 20260822190000) which:
 *   - scopes by workspace_id (the FK column, NOT user_id)
 *   - matches exact channel_type OR 'all'
 *   - covers global_suppression_list AND broadcast_optouts
 *
 * Returns "error" on any DB failure so the caller can fail closed.
 * NEVER returns "not_suppressed" when the DB state is unknown.
 */
async function checkWorkspaceSuppression(
  db: ConsentDb,
  workspace_id: string,
  contact_identifier: string,
  channel_type: string,
): Promise<SuppressionState> {
  try {
    const result = await (db.rpc("is_contact_suppressed_for_workspace", {
      _workspace_id: workspace_id,
      _contact_identifier: contact_identifier,
      _channel_type: channel_type,
    }) as unknown as Promise<{ data: boolean | null; error: unknown }>);
    if (result.error) return "error";
    return result.data === true ? "suppressed" : "not_suppressed";
  } catch {
    return "error";
  }
}

/**
 * Email-specific suppression from the suppressed_emails table.
 * Returns "error" on DB failure so the caller can fail closed.
 */
async function checkEmailSuppression(
  db: ConsentDb,
  contact_identifier: string,
): Promise<SuppressionState> {
  try {
    const result = await (db
      .from<{ email: string }>("suppressed_emails")
      .select("email")
      .eq("email", contact_identifier.toLowerCase().trim())
      .limit(1) as unknown as Promise<{ data: { email: string }[] | null; error: unknown }>);
    if (result.error) return "error";
    return (result.data?.length ?? 0) > 0 ? "suppressed" : "not_suppressed";
  } catch {
    return "error";
  }
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

  // Cross-workspace guard from caller-supplied metadata.
  if (contact_workspace_id && contact_workspace_id !== workspace_id) {
    reasons.push("CROSS_WORKSPACE_INELIGIBLE");
    return { validity: "not_valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  // Cross-workspace guard from the authoritative consent_record itself.
  // This check is independent of the optional caller-supplied contact_workspace_id
  // so a caller cannot bypass isolation simply by omitting that field.
  if (consent_record && consent_record.workspace_id !== workspace_id) {
    reasons.push("CROSS_WORKSPACE_INELIGIBLE");
    return { validity: "not_valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  // Workspace-scoped suppression (global list + broadcast opt-outs, any channel + 'all').
  const suppressionState = await checkWorkspaceSuppression(db, workspace_id, contact_identifier, channel_type);
  if (suppressionState === "error") {
    // Fail closed: unknown suppression state must never become ALLOW.
    reasons.push("SUPPRESSION_CHECK_FAILED");
    return { validity: "unknown", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  // Email-specific suppression list.
  const emailSuppressionState = channel_type === "email"
    ? await checkEmailSuppression(db, contact_identifier)
    : "not_suppressed";
  if (emailSuppressionState === "error") {
    reasons.push("SUPPRESSION_CHECK_FAILED");
    return { validity: "unknown", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  if (suppressionState === "suppressed" || emailSuppressionState === "suppressed") {
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

  // Unknown consent source cannot silently produce ALLOW.
  if (consent_record.consent_source === "unknown") {
    reasons.push("UNKNOWN_CONSENT");
    return { validity: "unknown", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: "unknown", workspace_id, reasons };
  }

  // Transactional-only path: exactly one of marketing/transactional is permitted.
  if (consent_record.communication_type === "transactional" || (!consent_record.marketing_allowed && consent_record.transactional_allowed)) {
    reasons.push("TRANSACTIONAL_ONLY");
    return { validity: "transactional_only", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: true, consent_source: consent_record.consent_source, consent_given_at: consent_record.consent_given_at, workspace_id, reasons };
  }

  // Neither marketing nor transactional permission → not valid.
  // A ConsentRecord object existing is not sufficient evidence on its own.
  if (!consent_record.marketing_allowed && !consent_record.transactional_allowed) {
    reasons.push("MARKETING_NOT_ALLOWED");
    return { validity: "not_valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: false, transactional_only: false, consent_source: consent_record.consent_source, consent_given_at: consent_record.consent_given_at, workspace_id, reasons };
  }

  reasons.push("CONSENT_VALID");
  return { validity: "valid", is_opted_out: false, is_globally_suppressed: false, is_channel_suppressed: false, marketing_allowed: consent_record.marketing_allowed, transactional_only: false, consent_source: consent_record.consent_source, consent_given_at: consent_record.consent_given_at, workspace_id, reasons };
}
