// supabase/functions/ai-action-approve/index.ts
// ============================================================
// PULSE AI — AI-3 Human Approval Gate
//
// Converts an AI-2 recommendation (ai_suggested_actions row) into
// a safe, authorized, auditable business action through three
// controlled decisions:
//
//   APPROVE  → validate params → enqueue → QUEUED
//   MODIFY   → record modifications → MODIFIED (awaits re-approval)
//   REJECT   → record rejection → REJECTED (terminal)
//   CANCEL   → record cancellation → CANCELLED (terminal)
//
// Security invariants:
//   - User identity is always resolved from the JWT; never from request body.
//   - Workspace membership is verified server-side before any state change.
//   - State transitions are enforced by the canonical state machine.
//   - Sensitive action types cannot bypass this gate.
//   - Idempotency: re-approving an already-queued action returns the
//     existing state without creating duplicate jobs.
//   - Every decision is written to the audit log.
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

  // 4. Verify workspace membership — never trust workspace_id from client
  const workspaceId: string = action.workspace_id;

  if (!workspaceId) {
    return json({ error: "Forbidden: action has no workspace context" }, 403, req);
  }

  // Check ownership
  const { data: ownedWs } = await sb
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  // Check membership
  const { data: membershipResult } = await sb.rpc("is_workspace_member", {
    _user_id: user.id,
    _workspace_id: workspaceId,
  });

  if (!ownedWs && !membershipResult) {
    return json({ error: "Forbidden: not a member of this workspace" }, 403, req);
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
    (currentStatus === "QUEUED" || currentStatus === "EXECUTING" || currentStatus === "COMPLETED") &&
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

  // 7. State machine enforcement
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
    const { error: rejectError } = await sb
      .from("ai_suggested_actions")
      .update({
        lifecycle_status: "REJECTED",
        rejected_at: now,
        approver_id: user.id,
        rejection_reason: rejection_reason ?? null,
        status: "dismissed",
      })
      .eq("id", action_id)
      .eq("lifecycle_status", currentStatus); // optimistic concurrency

    if (rejectError) {
      return json({ error: "Failed to reject action", detail: rejectError.message }, 500, req);
    }

    await logAudit(sb, {
      workspace_id: workspaceId,
      user_id: user.id,
      action_id,
      decision: "REJECT",
      previous_status: currentStatus,
      new_status: "REJECTED",
      rejection_reason,
    });

    return json({
      success: true,
      action_id,
      decision: "REJECT",
      lifecycle_status: "REJECTED",
      rejected_at: now,
    }, 200, req);
  }

  if (decision === "CANCEL") {
    const { error: cancelError } = await sb
      .from("ai_suggested_actions")
      .update({
        lifecycle_status: "CANCELLED",
        cancelled_at: now,
        approver_id: user.id,
        status: "dismissed",
      })
      .eq("id", action_id)
      .eq("lifecycle_status", currentStatus);

    if (cancelError) {
      return json({ error: "Failed to cancel action", detail: cancelError.message }, 500, req);
    }

    await logAudit(sb, {
      workspace_id: workspaceId,
      user_id: user.id,
      action_id,
      decision: "CANCEL",
      previous_status: currentStatus,
      new_status: "CANCELLED",
    });

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

    // Validate the modified parameters against workspace policy before storing
    const policy = await loadWorkspacePolicy(sb, workspaceId);
    const validation = validateAndClampActionParams(
      action.action_type,
      modifications,
      policy,
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

    // Merge any clamped values back into modifications
    const resolvedModifications = {
      ...modifications,
      ...(validation.clamped_values ?? {}),
    };

    // Preserve the original AI payload on first modification
    const originalPayload = action.original_payload ?? action.action_payload ?? {};

    const { error: modifyError } = await sb
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
      .eq("lifecycle_status", currentStatus);

    if (modifyError) {
      return json({ error: "Failed to record modification", detail: modifyError.message }, 500, req);
    }

    await logAudit(sb, {
      workspace_id: workspaceId,
      user_id: user.id,
      action_id,
      decision: "MODIFY",
      previous_status: currentStatus,
      new_status: "MODIFIED",
      modifications: resolvedModifications,
      validation_result: validation,
    });

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

  // 9. APPROVE path — full server-side validation before queuing

  // Sensitive action gate: even if it was AI-suggested, require explicit human APPROVE
  if (SENSITIVE_ACTION_TYPES.has(action.action_type) && action.suggested_by === "ai") {
    // Allowed — the human is explicitly approving. This is the correct path.
    // (Blocking would happen in execute path if lifecycle_status were not APPROVED)
  }

  // Load workspace policy (authoritative server-side — never trust client-supplied limits)
  const policy = await loadWorkspacePolicy(sb, workspaceId);

  // Use modified payload if present, otherwise original AI payload
  const effectivePayload: ActionParams =
    action.modified_payload ?? action.action_payload ?? {};

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

  // Apply any clamped values
  const resolvedPayload: ActionParams = {
    ...effectivePayload,
    ...(validation.clamped_values ?? {}),
  };

  // 10. Generate idempotency key for this approval
  const idempotencyKey = `ai3:${action_id}:approve:${Math.floor(Date.now() / 1000)}`;

  // 11. Enqueue job to canonical job_queue
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
    return json(
      { error: "Failed to enqueue action", detail: jobError?.message },
      500,
      req,
    );
  }

  // 12. Transition action to QUEUED — store all approval evidence
  const { error: approveError } = await sb
    .from("ai_suggested_actions")
    .update({
      lifecycle_status: "QUEUED",
      approved_at: now,
      queued_at: now,
      approver_id: user.id,
      idempotency_key: idempotencyKey,
      original_payload: action.original_payload ?? action.action_payload ?? {},
      validation_result: validation,
      job_queue_id: jobRow.id,
      status: "pending",
    })
    .eq("id", action_id)
    .eq("lifecycle_status", currentStatus); // optimistic concurrency — prevents double-queue

  if (approveError) {
    // Best-effort: cancel the job we just created to avoid orphan
    await sb.from("job_queue").update({ status: "cancelled" }).eq("id", jobRow.id);
    return json(
      { error: "Failed to record approval", detail: approveError.message },
      500,
      req,
    );
  }

  await logAudit(sb, {
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

async function loadWorkspacePolicy(
  // deno-lint-ignore no-explicit-any
  sb: any,
  workspaceId: string,
): Promise<WorkspacePolicy> {
  // Load from workspace_settings or plan limits if they exist.
  // Returns an empty policy (falls back to hard limits) if not configured.
  try {
    const { data } = await sb
      .from("workspace_settings")
      .select(
        "max_discount_percent, max_offer_value, max_reward_points, max_referral_credit, max_campaign_contacts, max_message_batch",
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    return (data as WorkspacePolicy | null) ?? {};
  } catch {
    return {};
  }
}

async function logAudit(
  // deno-lint-ignore no-explicit-any
  sb: any,
  context: {
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
  },
): Promise<void> {
  try {
    await sb.rpc("log_audit", {
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
        // Do not log raw modifications (may contain PII or sensitive offer data)
        has_modifications: context.modifications !== undefined,
        validation_valid: (context.validation_result as { valid?: boolean } | undefined)?.valid,
      },
    });
  } catch {
    // Audit logging failures must never block the approval response
    console.error("[ai-action-approve] audit log failed for action:", context.action_id);
  }
}
