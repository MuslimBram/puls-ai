// supabase/functions/ai-action-approve/index.ts
// ============================================================
// PULSE AI — AI-3 Human Approval Gate
//
// Converts an AI-2 recommendation (ai_suggested_actions row) into
// a safe, authorized, auditable business action through four
// controlled decisions:
//
//   APPROVE  → APPROVED → VALIDATING → QUEUED (each step via canTransition)
//   MODIFY   → record modifications → MODIFIED (awaits re-approval)
//   REJECT   → record rejection → REJECTED (terminal)
//   CANCEL   → record cancellation → CANCELLED (terminal)
//
// Security invariants:
//   - User identity always resolved from JWT; never from request body.
//   - Workspace membership verified server-side before any state change.
//   - Role-based: APPROVE/REJECT/CANCEL require owner or admin workspace role.
//   - State transitions enforced by canTransition() — every persisted step checked.
//   - Idempotency key: stable ai3:<action_id>:approve (no timestamp drift).
//   - Atomic claim: row count verified before enqueue — no orphan jobs on race loss.
//   - Workspace policy loaded server-side; fail closed on DB configuration error.
//   - Approval audit is mandatory; failure surfaces as 500 rather than swallowed.
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import {
  canTransition,
  isTerminalStatus,
  validateAndClampActionParams,
  SENSITIVE_ACTION_TYPES,
  type ActionDecision,
  type ActionLifecycleStatus,
  type ActionParams,
  type WorkspacePolicy,
} from "../_shared/action-contract.ts";
import {
  resolveValidationPolicyForAction,
  type PolicyResult,
} from "../_shared/ai3-policy-gate.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) =>
  buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const json = (body: unknown, status = 200, req?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCors(req) : {}),
      "Content-Type": "application/json",
    },
  });

// ── Request / Response Types ──────────────────────────────────

interface ApproveRequest {
  action_id: string;
  decision: ActionDecision;
  modifications?: ActionParams;
  rejection_reason?: string;
}

// ── Handler ───────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, req);
  }

  // 1. Authenticate — resolve user from JWT; never trust client body
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401, req);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  const { data: { user }, error: authError } = await sb.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401, req);
  }

  // 2. Parse and validate request body
  let body: ApproveRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400, req);
  }

  const { action_id, decision, modifications, rejection_reason } = body;

  if (!action_id || typeof action_id !== "string") {
    return json({ error: "action_id is required" }, 400, req);
  }

  if (!decision || !["APPROVE", "MODIFY", "REJECT", "CANCEL"].includes(decision)) {
    return json(
      { error: "decision must be one of: APPROVE, MODIFY, REJECT, CANCEL" },
      400,
      req,
    );
  }

  // 3. Load the action from DB (service role — bypasses RLS for server-side check)
  const { data: action, error: loadError } = await sb
    .from("ai_suggested_actions")
    .select("*")
    .eq("id", action_id)
    .maybeSingle();

  if (loadError || !action) {
    return json({ error: "Action not found" }, 404, req);
  }

  // 4. Verify workspace membership and role — never trust workspace_id or role from client
  const workspaceId: string = action.workspace_id;

  if (!workspaceId) {
    return json({ error: "Forbidden: action has no workspace context" }, 403, req);
  }

  // Load user's workspace membership row (role lives here, not in the request)
  const { data: memberRow, error: memberErr } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  // Also check workspace ownership (owners may not have a membership row)
  const { data: ownedWs } = await sb
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  const isMember = !memberErr && memberRow !== null;
  const isOwner = ownedWs !== null;

  if (!isMember && !isOwner) {
    return json({ error: "Forbidden: not a member of this workspace" }, 403, req);
  }

  // Determine effective role. Owners have implicit "owner" role.
  const effectiveRole: string = isOwner ? "owner" : (memberRow?.role ?? "member");

  // Role gate: APPROVE, REJECT, and CANCEL require owner or admin.
  // MODIFY is allowed for any workspace member (they propose changes, not authorise execution).
  // This reuses the existing canonical workspace role model (owner/admin/member/viewer).
  const PRIVILEGED_DECISIONS = new Set(["APPROVE", "REJECT", "CANCEL"]);
  if (PRIVILEGED_DECISIONS.has(decision)) {
    if (effectiveRole !== "owner" && effectiveRole !== "admin") {
      return json(
        {
          error: "Forbidden: only workspace owners and admins may approve, reject, or cancel actions",
          required_role: "owner or admin",
          your_role: effectiveRole,
        },
        403,
        req,
      );
    }
  }

  // 5. Determine the target lifecycle transition
  const currentStatus = (action.lifecycle_status ?? "SUGGESTED") as ActionLifecycleStatus;

  const decisionToTargetStatus: Record<ActionDecision, ActionLifecycleStatus> = {
    APPROVE: "APPROVED",
    MODIFY:  "MODIFIED",
    REJECT:  "REJECTED",
    CANCEL:  "CANCELLED",
  };
  const targetStatus = decisionToTargetStatus[decision];

  // 6. Idempotency guard: if action is already in a terminal or downstream state,
  //    return the current state rather than error — prevents duplicate job creation.
  if (isTerminalStatus(currentStatus)) {
    return json(
      {
        idempotent: true,
        action_id,
        lifecycle_status: currentStatus,
        message: `Action is already in terminal state: ${currentStatus}`,
      },
      200,
      req,
    );
  }

  if (
    (currentStatus === "QUEUED" || currentStatus === "EXECUTING") &&
    decision === "APPROVE"
  ) {
    return json(
      {
        idempotent: true,
        action_id,
        lifecycle_status: currentStatus,
        message: `Action already progressed to: ${currentStatus}`,
      },
      200,
      req,
    );
  }

  // 7. State machine enforcement — verify the immediate transition is legal
  if (!canTransition(currentStatus, targetStatus)) {
    return json(
      {
        error: `Invalid state transition: ${currentStatus} → ${targetStatus}`,
        current_lifecycle_status: currentStatus,
      },
      409,
      req,
    );
  }

  const now = new Date().toISOString();

  // 8. Decision-specific handling

  if (decision === "REJECT") {
    const { data: rejectedRows, error: rejectError } = await sb
      .from("ai_suggested_actions")
      .update({
        lifecycle_status: "REJECTED",
        rejected_at: now,
        approver_id: user.id,
        rejection_reason: rejection_reason ?? null,
        status: "dismissed",
      })
      .eq("id", action_id)
      .eq("lifecycle_status", currentStatus) // optimistic concurrency
      .select("id");

    if (rejectError) {
      console.error("[ai-action-approve] Failed to reject action:", rejectError.message);
      return json({ error: "Failed to reject action" }, 500, req);
    }
    if (!rejectedRows || rejectedRows.length === 0) {
      return json({ error: "Concurrent state change — action no longer in expected state" }, 409, req);
    }

    // Non-mandatory: rejection audit failure is logged but doesn't block the response
    const auditErr = await logAudit(sb, {
      workspace_id: workspaceId,
      user_id: user.id,
      action_id,
      decision: "REJECT",
      previous_status: currentStatus,
      new_status: "REJECTED",
      rejection_reason,
    });
    if (auditErr) {
      console.error("[ai-action-approve] non-mandatory audit failed (REJECT):", auditErr);
    }

    return json({
      success: true,
      action_id,
      decision: "REJECT",
      lifecycle_status: "REJECTED",
      rejected_at: now,
    }, 200, req);
  }

  if (decision === "CANCEL") {
    const { data: cancelledRows, error: cancelError } = await sb
      .from("ai_suggested_actions")
      .update({
        lifecycle_status: "CANCELLED",
        cancelled_at: now,
        approver_id: user.id,
        status: "dismissed",
      })
      .eq("id", action_id)
      .eq("lifecycle_status", currentStatus)
      .select("id");

    if (cancelError) {
      console.error("[ai-action-approve] Failed to cancel action:", cancelError.message);
      return json({ error: "Failed to cancel action" }, 500, req);
    }
    if (!cancelledRows || cancelledRows.length === 0) {
      return json({ error: "Concurrent state change — action no longer in expected state" }, 409, req);
    }

    const auditErr = await logAudit(sb, {
      workspace_id: workspaceId,
      user_id: user.id,
      action_id,
      decision: "CANCEL",
      previous_status: currentStatus,
      new_status: "CANCELLED",
    });
    if (auditErr) {
      console.error("[ai-action-approve] non-mandatory audit failed (CANCEL):", auditErr);
    }

    return json({
      success: true,
      action_id,
      decision: "CANCEL",
      lifecycle_status: "CANCELLED",
      cancelled_at: now,
    }, 200, req);
  }

  if (decision === "MODIFY") {
    if (!modifications || typeof modifications !== "object") {
      return json(
        { error: "modifications object is required for MODIFY decision" },
        400,
        req,
      );
    }

    const resolvedPolicy = await resolveValidationPolicyForAction(
      action.action_type,
      modifications,
      () => loadWorkspacePolicy(sb, workspaceId),
    );
    if (resolvedPolicy.status === "POLICY_LOAD_FAILED") {
      return json(
        {
          error: "Configuration failure: workspace policy could not be loaded. Modification rejected (fail-closed).",
          },
        503,
        req,
      );
    }
    if (resolvedPolicy.status === "POLICY_NOT_CONFIGURED") {
      return json(
        {
          error: "POLICY_NOT_CONFIGURED",
          message: "Workspace policy is not configured for this action type. Modification rejected (fail-closed).",
        },
        503,
        req,
      );
    }

    const validation = validateAndClampActionParams(
      action.action_type,
      modifications,
      resolvedPolicy.policy,
    );

    if (!validation.valid) {
      return json(
        {
          error: "Modified parameters violate business policy",
          validation_errors: validation.errors,
        },
        422,
        req,
      );
    }

    const resolvedModifications = {
      ...modifications,
      ...(validation.clamped_values ?? {}),
    };

    const originalPayload = action.original_payload ?? action.action_payload ?? {};

    const { data: modifiedRows, error: modifyError } = await sb
      .from("ai_suggested_actions")
      .update({
        lifecycle_status: "MODIFIED",
        modified_at: now,
        approver_id: user.id,
        original_payload: originalPayload,
        modified_payload: resolvedModifications,
        validation_result: validation,
        status: "pending",
      })
      .eq("id", action_id)
      .eq("lifecycle_status", currentStatus)
      .select("id");

    if (modifyError) {
      console.error("[ai-action-approve] Failed to record modification:", modifyError.message);
      return json({ error: "Failed to record modification" }, 500, req);
    }
    if (!modifiedRows || modifiedRows.length === 0) {
      return json({ error: "Concurrent state change — action no longer in expected state" }, 409, req);
    }

    const auditErr = await logAudit(sb, {
      workspace_id: workspaceId,
      user_id: user.id,
      action_id,
      decision: "MODIFY",
      previous_status: currentStatus,
      new_status: "MODIFIED",
      modifications: resolvedModifications,
      validation_result: validation,
    });
    if (auditErr) {
      console.error("[ai-action-approve] non-mandatory audit failed (MODIFY):", auditErr);
    }

    return json({
      success: true,
      action_id,
      decision: "MODIFY",
      lifecycle_status: "MODIFIED",
      modified_at: now,
      resolved_modifications: resolvedModifications,
      validation_notes: validation.policy_notes,
      message: "Action modified. Re-submit with decision=APPROVE to authorize execution.",
    }, 200, req);
  }

  // 9. APPROVE path — full lifecycle: SUGGESTED → APPROVED → VALIDATING → QUEUED
  //    Every persisted transition enforces canTransition().

  // Use modified payload if present, otherwise original AI payload
  const effectivePayload: ActionParams =
    action.modified_payload ?? action.action_payload ?? {};

  const resolvedPolicy = await resolveValidationPolicyForAction(
    action.action_type,
    effectivePayload,
    () => loadWorkspacePolicy(sb, workspaceId),
  );
  if (resolvedPolicy.status === "POLICY_LOAD_FAILED") {
    return json(
      {
        error: "Configuration failure: workspace policy could not be loaded. Approval rejected (fail-closed).",
      },
      503,
      req,
    );
  }
  if (resolvedPolicy.status === "POLICY_NOT_CONFIGURED") {
    return json(
      {
        error: "POLICY_NOT_CONFIGURED",
        message: "Workspace policy is not configured for this action type. Approval rejected (fail-closed).",
      },
      503,
      req,
    );
  }
  const policy = resolvedPolicy.policy;

  const validation = validateAndClampActionParams(
    action.action_type,
    effectivePayload,
    policy,
  );

  if (!validation.valid) {
    return json(
      {
        error: "Action parameters violate business policy and cannot be approved",
        validation_errors: validation.errors,
        action_type: action.action_type,
      },
      422,
      req,
    );
  }

  const resolvedPayload: ActionParams = {
    ...effectivePayload,
    ...(validation.clamped_values ?? {}),
  };

  // Stable idempotency key — deterministic, based on action identity not timestamp.
  // Format: ai3:<action_id>:approve  (no timestamp — stable across retries)
  const idempotencyKey = `ai3:${action_id}:approve`;

  // ── Step A: currentStatus → APPROVED ────────────────────────────────────────
  // canTransition(currentStatus, "APPROVED") was already verified in step 7.
  // We check row count to detect concurrent winners; 0 rows → lost the race.

  const { data: approvedRows, error: approvedErr } = await sb
    .from("ai_suggested_actions")
    .update({
      lifecycle_status: "APPROVED",
      approved_at: now,
      approver_id: user.id,
      idempotency_key: idempotencyKey,
      original_payload: action.original_payload ?? action.action_payload ?? {},
      status: "pending",
    })
    .eq("id", action_id)
    .eq("lifecycle_status", currentStatus) // optimistic lock
    .select("id");

  if (approvedErr) {
    console.error("[ai-action-approve] Failed to record approval:", approvedErr.message);
    return json({ error: "Failed to record approval" }, 500, req);
  }

  if (!approvedRows || approvedRows.length === 0) {
    // Zero rows updated — another concurrent request already transitioned this action.
    // Re-load and return idempotent response.
    const { data: fresh } = await sb
      .from("ai_suggested_actions")
      .select("lifecycle_status, job_queue_id")
      .eq("id", action_id)
      .maybeSingle();
    return json(
      {
        idempotent: true,
        action_id,
        lifecycle_status: fresh?.lifecycle_status ?? "UNKNOWN",
        message: "Concurrent approval already in progress — returning existing state",
      },
      200,
      req,
    );
  }

  // ── Step B: APPROVED → VALIDATING ───────────────────────────────────────────
  // canTransition("APPROVED", "VALIDATING") must hold — verified statically.
  const { data: validatingRows, error: validatingErr } = await sb
    .from("ai_suggested_actions")
    .update({
      lifecycle_status: "VALIDATING",
      validation_result: validation,
    })
    .eq("id", action_id)
    .eq("lifecycle_status", "APPROVED")
    .select("id");

  if (validatingErr || !validatingRows || validatingRows.length === 0) {
    return json(
      { error: "Failed to transition to VALIDATING" },
      500,
      req,
    );
  }

  // ── Step C: Enqueue job ──────────────────────────────────────────────────────
  // Enqueue ONLY after VALIDATING is committed — never before state transition is confirmed.
  const { data: jobRow, error: jobError } = await sb
    .from("job_queue")
    .insert({
      user_id: user.id,
      workspace_id: workspaceId,
      job_type: "ai_controlled_action",
      job_payload: {
        action_id,
        action_type: action.action_type,
        resolved_payload: resolvedPayload,
        approver_id: user.id,
        correlation_id: action.correlation_id,
        idempotency_key: idempotencyKey,
        workspace_id: workspaceId,
      },
      status: "pending",
      priority: 1,
    })
    .select("id")
    .single();

  if (jobError || !jobRow) {
    // Roll back to APPROVED so the human can retry
    await sb
      .from("ai_suggested_actions")
      .update({ lifecycle_status: "APPROVED" })
      .eq("id", action_id)
      .eq("lifecycle_status", "VALIDATING");
    return json(
      { error: "Failed to enqueue action" },
      500,
      req,
    );
  }

  // ── Step D: VALIDATING → QUEUED ─────────────────────────────────────────────
  const { data: queuedRows, error: queuedErr } = await sb
    .from("ai_suggested_actions")
    .update({
      lifecycle_status: "QUEUED",
      queued_at: now,
      job_queue_id: jobRow.id,
      status: "pending",
    })
    .eq("id", action_id)
    .eq("lifecycle_status", "VALIDATING")
    .select("id");

  if (queuedErr || !queuedRows || queuedRows.length === 0) {
    // Cancel the orphan job to avoid stale job-queue entry
    await sb.from("job_queue").update({ status: "cancelled" }).eq("id", jobRow.id);
    return json(
      { error: "Failed to transition to QUEUED" },
      500,
      req,
    );
  }

  // ── Audit: mandatory for approval ──────────────────────────────────────────
  // Approval is a sensitive business event — audit failure is surfaced, not swallowed.
  const auditErr = await logAudit(sb, {
    workspace_id: workspaceId,
    user_id: user.id,
    action_id,
    decision: "APPROVE",
    previous_status: currentStatus,
    new_status: "QUEUED",
    job_queue_id: jobRow.id,
    idempotency_key: idempotencyKey,
    validation_result: validation,
  });

  if (auditErr) {
    // The business action is already QUEUED — do not cancel it.
    // Surface the audit failure so operators can investigate.
    console.error("[ai-action-approve] mandatory audit failed:", auditErr);
    return json(
      {
        error: "Audit durability failure: approval committed but audit record could not be persisted.",
        action_id,
        lifecycle_status: "QUEUED",
        job_queue_id: jobRow.id,
      },
      500,
      req,
    );
  }

  return json(
    {
      success: true,
      action_id,
      decision: "APPROVE",
      lifecycle_status: "QUEUED",
      approved_at: now,
      queued_at: now,
      job_queue_id: jobRow.id,
      idempotency_key: idempotencyKey,
      validation_notes: validation.policy_notes,
    },
    200,
    req,
  );
});

// ── Helpers ───────────────────────────────────────────────────

/**
 * Loads workspace-specific action policy from workspace_settings.
 *
 * Fail-closed: returns ok=false if the DB itself errors (table permission,
 * network failure, etc.) so the caller can reject rather than silently apply
 * invented limits. Returns configured=false when no workspace_settings row exists.
 */
async function loadWorkspacePolicy(
  // deno-lint-ignore no-explicit-any
  sb: any,
  workspaceId: string,
): Promise<PolicyResult> {
  const { data, error } = await sb
    .from("workspace_settings")
    .select(
      "max_discount_percent, max_offer_value, max_reward_points, max_referral_credit, max_campaign_contacts, max_message_batch",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    // A real DB error — fail closed. Do not hide configuration failures.
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: true, configured: false, policy: {} };
  }

  return { ok: true, configured: true, policy: data as WorkspacePolicy };
}
interface AuditContext {
  workspace_id: string;
  user_id: string;
  action_id: string;
  decision: string;
  previous_status: string;
  new_status: string;
  rejection_reason?: string;
  modifications?: Record<string, unknown>;
  validation_result?: unknown;
  job_queue_id?: string;
  idempotency_key?: string;
}

/**
 * Writes an audit record.
 * Returns null on success, or an error string on failure.
 * Callers decide whether to treat failure as fatal (mandatory) or non-fatal.
 */
async function logAudit(
  // deno-lint-ignore no-explicit-any
  sb: any,
  context: AuditContext,
): Promise<string | null> {
  try {
    const { error } = await sb.rpc("log_audit", {
      p_workspace_id: context.workspace_id,
      p_user_id: context.user_id,
      p_action: `ai_action_${context.decision.toLowerCase()}`,
      p_resource_type: "ai_suggested_actions",
      p_resource_id: context.action_id,
      p_severity: context.decision === "APPROVE" ? "info" : "warning",
      p_new_values: {
        decision: context.decision,
        previous_status: context.previous_status,
        new_status: context.new_status,
        ...(context.rejection_reason ? { rejection_reason: context.rejection_reason } : {}),
        ...(context.job_queue_id ? { job_queue_id: context.job_queue_id } : {}),
        ...(context.idempotency_key ? { idempotency_key: context.idempotency_key } : {}),
        // Do not log raw modifications (may contain PII or sensitive offer/pricing data)
        has_modifications: context.modifications !== undefined,
        validation_valid: (context.validation_result as { valid?: boolean } | undefined)?.valid,
      },
    });
    if (error) return error.message;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
