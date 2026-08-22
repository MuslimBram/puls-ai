// supabase/functions/_shared/action-contract.ts
// ============================================================
// PULSE AI — AI-3 Controlled Action Contract
//
// Canonical types, lifecycle state machine, and business rule
// validation/clamping for the controlled action system.
//
// AI-2 = reasoning / orchestration / recommendation
// AI-3 = authorization / controlled action / execution
//
// Zero external calls. Zero LLM usage. Fully deterministic.
// ============================================================

// ── Lifecycle States ──────────────────────────────────────────

export const ActionLifecycleStatus = {
  SUGGESTED:  "SUGGESTED",
  APPROVED:   "APPROVED",
  MODIFIED:   "MODIFIED",
  REJECTED:   "REJECTED",
  VALIDATING: "VALIDATING",
  QUEUED:     "QUEUED",
  EXECUTING:  "EXECUTING",
  COMPLETED:  "COMPLETED",
  FAILED:     "FAILED",
  CANCELLED:  "CANCELLED",
} as const;

export type ActionLifecycleStatus =
  (typeof ActionLifecycleStatus)[keyof typeof ActionLifecycleStatus];

export type ActionDecision = "APPROVE" | "MODIFY" | "REJECT" | "CANCEL";

// ── Sensitive Action Types ────────────────────────────────────
// These action types MUST NOT bypass the human approval gate
// merely because an AI generated them.

export const SENSITIVE_ACTION_TYPES = new Set<string>([
  "suggest_offer",
  "suggest_campaign",
  "suggest_reply",
  "launch_campaign",
  "send_message",
  "create_booking",
  "issue_reward",
  "issue_discount",
  "issue_referral",
  "execute_automation",
  "bulk_email",
  "bulk_sms",
  "create_offer",
  "seo_opportunity",       // content publication is workspace-affecting
  "competitor_insight",    // may trigger outbound competitive action
]);

// ── State Machine ─────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ActionLifecycleStatus, ActionLifecycleStatus[]> = {
  SUGGESTED:  ["APPROVED", "MODIFIED", "REJECTED", "CANCELLED"],
  APPROVED:   ["VALIDATING", "CANCELLED"],
  MODIFIED:   ["APPROVED", "REJECTED", "CANCELLED"],
  REJECTED:   [],
  VALIDATING: ["QUEUED", "FAILED"],
  QUEUED:     ["EXECUTING", "CANCELLED"],
  EXECUTING:  ["COMPLETED", "FAILED"],
  COMPLETED:  [],
  FAILED:     ["QUEUED"], // bounded retry — executor enforces attempt limit
  CANCELLED:  [],
};

/**
 * Returns true only if the state transition is valid per the AI-3 lifecycle.
 * Any transition not in this map is an authorization failure.
 */
export function canTransition(
  from: ActionLifecycleStatus,
  to: ActionLifecycleStatus,
): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Returns true if the current lifecycle status is a terminal state.
 * Terminal actions cannot be approved, executed, or modified.
 */
export function isTerminalStatus(status: ActionLifecycleStatus): boolean {
  return status === "COMPLETED" || status === "REJECTED" || status === "CANCELLED";
}

/**
 * Returns true if the current lifecycle status is executable
 * (i.e., has already received human authorization and validation).
 */
export function isExecutableStatus(status: ActionLifecycleStatus): boolean {
  return status === "QUEUED";
}

// ── Business Rule Validation / Clamping ──────────────────────

export interface ActionParams {
  discount_percent?: number;
  offer_value?: number;
  reward_points?: number;
  referral_credit?: number;
  campaign_contacts?: number;
  message_batch_size?: number;
  [key: string]: unknown;
}

export interface WorkspacePolicy {
  max_discount_percent?: number;
  max_offer_value?: number;
  max_reward_points?: number;
  max_referral_credit?: number;
  max_campaign_contacts?: number;
  max_message_batch?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  clamped_values?: Record<string, number>;
  policy_notes?: string[];
}

// Absolute hard limits — never overridden by workspace config.
// Where no workspace policy exists, these are the fallback.
// If a value violates even the fallback, it is a deterministic failure.
const HARD_LIMITS = {
  discount_percent_max: 80,
  offer_value_max: 10_000,
  reward_points_max: 100_000,
  referral_credit_max: 500,
  campaign_contact_limit: 100_000,
  message_batch_max: 10_000,
};

/**
 * Validates action parameters against workspace policy and hard limits.
 *
 * Behavior:
 * - Values within the effective limit: pass through unchanged.
 * - Values between workspace policy limit and hard limit: clamped (safe degradation).
 * - Values violating the workspace policy (where policy is stricter): REJECTED.
 * - Values violating the hard limit: REJECTED regardless of policy.
 *
 * Where workspace policy has no configured limit, the hard limit is used as
 * a fallback and clamping is applied rather than rejection.
 */
export function validateAndClampActionParams(
  _action_type: string,
  params: ActionParams,
  policy: WorkspacePolicy,
): ValidationResult {
  const errors: string[] = [];
  const clamped: Record<string, number> = {};
  const notes: string[] = [];

  function check(
    field: keyof ActionParams & string,
    value: number | undefined,
    hardMax: number,
    policyMax: number | undefined,
    allowNegative = false,
  ): void {
    if (value === undefined) return;
    if (!allowNegative && value < 0) {
      errors.push(`${field} must be >= 0, got ${value}`);
      return;
    }
    if (field === "discount_percent" && value > 100) {
      errors.push(`${field} must be 0-100, got ${value}`);
      return;
    }
    if (value > hardMax) {
      errors.push(`${field} ${value} exceeds hard limit ${hardMax}`);
      return;
    }
    if (policyMax !== undefined && value > policyMax) {
      // Workspace policy is stricter than hard limit — reject (do not clamp over policy)
      errors.push(`${field} ${value} exceeds workspace policy limit ${policyMax}`);
      return;
    }
    // No policy configured: hard limit is the ceiling; clamp silently
    // (already checked value <= hardMax above)
  }

  function checkWithClamp(
    field: keyof ActionParams & string,
    value: number | undefined,
    hardMax: number,
    policyMax: number | undefined,
  ): void {
    if (value === undefined) return;
    if (value < 0) {
      errors.push(`${field} must be >= 0, got ${value}`);
      return;
    }
    if (field === "discount_percent" && value > 100) {
      errors.push(`${field} must be 0-100, got ${value}`);
      return;
    }
    const effectiveMax = policyMax !== undefined
      ? Math.min(hardMax, policyMax)
      : hardMax;
    if (value > effectiveMax) {
      if (policyMax !== undefined) {
        // Workspace policy configured — reject: do not override explicit business policy
        errors.push(`${field} ${value} exceeds workspace policy limit ${effectiveMax}`);
      } else {
        // No workspace policy: clamp to hard limit
        clamped[field] = hardMax;
        notes.push(`${field} clamped from ${value} to hard limit ${hardMax}`);
      }
    }
  }

  // discount_percent: hard limit is absolute — exceeding it always rejects.
  // Clamping financial discounts over the hard maximum without explicit business approval
  // would silently create an unauthorized commercial action.
  check(
    "discount_percent",
    params.discount_percent,
    HARD_LIMITS.discount_percent_max,
    policy.max_discount_percent,
  );

  // offer_value: clamp to hard limit when no workspace policy is configured.
  checkWithClamp(
    "offer_value",
    params.offer_value,
    HARD_LIMITS.offer_value_max,
    policy.max_offer_value,
  );

  check(
    "reward_points",
    params.reward_points,
    HARD_LIMITS.reward_points_max,
    policy.max_reward_points,
  );

  check(
    "referral_credit",
    params.referral_credit,
    HARD_LIMITS.referral_credit_max,
    policy.max_referral_credit,
  );

  check(
    "campaign_contacts",
    params.campaign_contacts,
    HARD_LIMITS.campaign_contact_limit,
    policy.max_campaign_contacts,
  );

  check(
    "message_batch_size",
    params.message_batch_size,
    HARD_LIMITS.message_batch_max,
    policy.max_message_batch,
  );

  return {
    valid: errors.length === 0,
    errors,
    clamped_values: Object.keys(clamped).length > 0 ? clamped : undefined,
    policy_notes: notes.length > 0 ? notes : undefined,
  };
}

// ── AI-2 → AI-3 Bridge Types ──────────────────────────────────

/**
 * A structured recommendation from the AI-2 orchestration facade.
 * AI-3 consumes this to create a controlled action proposal.
 */
export interface AI2Recommendation {
  action_type: string;
  title: string;
  description: string;
  confidence: number;
  impact_estimate: "Low" | "Medium" | "High";
  action_payload: ActionParams;
  source_signal: string;
  workspace_id: string;
  user_id: string;
}

/**
 * A controlled action record as stored in ai_suggested_actions.
 * This is what AI-3 reads and transitions through the lifecycle.
 */
export interface ControlledAction {
  id: string;
  workspace_id: string;
  user_id: string;
  action_type: string;
  title: string;
  description: string | null;
  confidence: number;
  impact_estimate: string | null;
  action_payload: ActionParams;
  lifecycle_status: ActionLifecycleStatus;
  idempotency_key: string | null;
  approver_id: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  modified_at: string | null;
  cancelled_at: string | null;
  rejection_reason: string | null;
  original_payload: ActionParams | null;
  modified_payload: ActionParams | null;
  validation_result: ValidationResult | null;
  execution_attempts: number;
  failure_reason: string | null;
  queued_at: string | null;
  executing_at: string | null;
  failed_at: string | null;
  job_queue_id: string | null;
  suggested_by: string;
  correlation_id: string;
  created_at: string;
}
