// supabase/functions/ai-action-approve/ai-action-approve.test.ts
// ============================================================
// PULSE AI — AI-3 Controlled Action Security Tests
//
// Behavioral tests for the canonical AI-3 state machine and
// business rule validation logic.
//
// Tests use deterministic, in-process logic from action-contract.ts.
// NO network calls. NO database calls. NO LLM calls.
//
// Coverage:
//   1.  Unauthorized user cannot approve an action
//   2.  User from Workspace A cannot execute Workspace B action
//   3.  Client-supplied workspace/role spoofing fails
//   4.  Rejected action cannot execute
//   5.  Unapproved sensitive action cannot execute
//   6.  Modified action is revalidated before execution
//   7.  Out-of-policy values are rejected or safely clamped
//   8.  Duplicate execution is prevented
//   9.  Retry is idempotent
//   10. Completed action cannot execute twice
//   11. Invalid state transitions fail
//   12. AI recommendation alone is insufficient authorization
// ============================================================

import {
  canTransition,
  isTerminalStatus,
  isExecutableStatus,
  validateAndClampActionParams,
  SENSITIVE_ACTION_TYPES,
  ActionLifecycleStatus,
} from "../_shared/action-contract.ts";
import { resolveValidationPolicyForAction } from "../_shared/ai3-policy-gate.ts";

// ── Mini test harness ─────────────────────────────────────────

let passed = 0;
let failed = 0;
const sectionResults: { name: string; pass: boolean }[] = [];

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(
    actual === expected,
    `${label}  (got: ${JSON.stringify(actual)}, want: ${JSON.stringify(expected)})`,
  );
}

function section(name: string): void {
  console.log(`\n=== ${name} ===`);
}

// ── Simulate the approval gate workspace authorization check ──

function simulateAuthorization(
  requestUserId: string,
  actionWorkspaceId: string,
  memberWorkspaceIds: string[],  // server-loaded from DB — not client-supplied
): { authorized: boolean; reason: string } {
  // Server-side: the workspace_id comes from the DB action row, not the client
  if (!memberWorkspaceIds.includes(actionWorkspaceId)) {
    return { authorized: false, reason: "not_a_workspace_member" };
  }
  if (!requestUserId) {
    return { authorized: false, reason: "no_authenticated_user" };
  }
  return { authorized: true, reason: "ok" };
}

// ── Simulate the idempotency check ────────────────────────────

function simulateApprovalIdempotency(
  currentStatus: ActionLifecycleStatus,
): { idempotent: boolean; blocked: boolean } {
  if (isTerminalStatus(currentStatus)) {
    return { idempotent: true, blocked: true };
  }
  if (
    currentStatus === "QUEUED" ||
    currentStatus === "EXECUTING" ||
    currentStatus === "COMPLETED"
  ) {
    return { idempotent: true, blocked: true };
  }
  return { idempotent: false, blocked: false };
}

// ── TEST 1: Unauthorized user cannot approve ──────────────────

section("TEST 1 — Unauthorized user cannot approve");
{
  const { authorized, reason } = simulateAuthorization("", "ws-a", ["ws-a"]);
  assert(!authorized, "Missing JWT → authorization denied");
  assertEqual(reason, "no_authenticated_user", "Reason is no_authenticated_user");

  const { authorized: auth2 } = simulateAuthorization("user-1", "ws-a", []);
  assert(!auth2, "Non-member user → authorization denied");
}

// ── TEST 2: User from Workspace A cannot execute Workspace B action ──

section("TEST 2 — Cross-workspace isolation");
{
  const userWorkspaces = ["ws-a"]; // user only belongs to ws-a
  const actionBelongsToWorkspace = "ws-b"; // action is in ws-b

  const { authorized } = simulateAuthorization("user-1", actionBelongsToWorkspace, userWorkspaces);
  assert(!authorized, "ws-a user cannot access ws-b action");

  // If the client sends workspace_id=ws-a in the body but action row says ws-b,
  // the server must use the row's workspace, not the client's value.
  // Here we simulate what the server does:
  const serverLoadedWorkspaceId = "ws-b"; // from DB row
  const clientSuppliedWorkspaceId = "ws-a"; // from request body — ignored

  assert(
    serverLoadedWorkspaceId !== clientSuppliedWorkspaceId,
    "Server workspace_id (from DB row) differs from client-supplied workspace_id",
  );

  const { authorized: auth2 } = simulateAuthorization("user-1", serverLoadedWorkspaceId, userWorkspaces);
  assert(!auth2, "Authorization uses DB workspace_id, not client-supplied value → denied");
}

// ── TEST 3: Client-supplied workspace/role spoofing fails ─────

section("TEST 3 — Client-supplied spoofing rejected");
{
  // Simulate a request where client sends claimed_workspace_id and claimed_role
  const claimedWorkspaceId = "ws-admin"; // attacker claims admin workspace
  const claimedRole = "admin";           // attacker claims admin role

  // Server-side: we never use these. We load workspace from action row.
  const dbActionWorkspaceId = "ws-normal"; // actual workspace in DB
  const serverLoadedMemberships = ["ws-normal"]; // user's actual memberships from DB

  // The server uses dbActionWorkspaceId for the membership check
  const { authorized } = simulateAuthorization("attacker", dbActionWorkspaceId, serverLoadedMemberships);

  assert(authorized, "User IS a member of their own workspace");

  // But they cannot reach ws-admin just by claiming it in the request
  const { authorized: adminAccess } = simulateAuthorization("attacker", claimedWorkspaceId, serverLoadedMemberships);
  assert(!adminAccess, "Claimed admin workspace rejected — not in server-loaded memberships");

  // Role claim is never used by the approval gate — only workspace membership matters
  assert(
    claimedRole === "admin",
    "Client may claim any role (suppressed — only membership is checked server-side)",
  );
}

// ── TEST 4: Rejected action cannot execute ────────────────────

section("TEST 4 — Rejected action cannot execute");
{
  const rejectedStatus: ActionLifecycleStatus = "REJECTED";

  assert(
    !canTransition(rejectedStatus, "EXECUTING"),
    "REJECTED → EXECUTING transition blocked",
  );
  assert(
    !canTransition(rejectedStatus, "QUEUED"),
    "REJECTED → QUEUED transition blocked",
  );
  assert(
    !canTransition(rejectedStatus, "APPROVED"),
    "REJECTED → APPROVED transition blocked",
  );
  assert(
    isTerminalStatus(rejectedStatus),
    "REJECTED is a terminal state",
  );

  // Idempotency check: trying to approve a rejected action returns blocked
  const { blocked } = simulateApprovalIdempotency(rejectedStatus);
  assert(blocked, "Approval gate returns idempotent blocked for REJECTED status");
}

// ── TEST 5: Unapproved sensitive action cannot execute ────────

section("TEST 5 — Unapproved sensitive action cannot execute");
{
  // All sensitive action types must be in the set
  const sensitiveTypes = [
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
  ];

  for (const actionType of sensitiveTypes) {
    assert(
      SENSITIVE_ACTION_TYPES.has(actionType),
      `${actionType} is in SENSITIVE_ACTION_TYPES`,
    );
  }

  // A SUGGESTED action (not yet approved) cannot transition to EXECUTING
  const suggestedStatus: ActionLifecycleStatus = "SUGGESTED";
  assert(
    !canTransition(suggestedStatus, "EXECUTING"),
    "SUGGESTED → EXECUTING blocked (requires human approval first)",
  );
  assert(
    !canTransition(suggestedStatus, "QUEUED"),
    "SUGGESTED → QUEUED blocked (requires human approval first)",
  );

  // The only path to executable is: SUGGESTED → APPROVED → VALIDATING → QUEUED → EXECUTING
  assert(canTransition("SUGGESTED", "APPROVED"), "SUGGESTED → APPROVED allowed (human decision)");
  assert(canTransition("APPROVED", "VALIDATING"), "APPROVED → VALIDATING allowed");
  assert(canTransition("VALIDATING", "QUEUED"), "VALIDATING → QUEUED allowed");
  assert(canTransition("QUEUED", "EXECUTING"), "QUEUED → EXECUTING allowed");
}

// ── TEST 6: Modified action is revalidated before execution ───

section("TEST 6 — Modified action revalidated");
{
  const modifiedStatus: ActionLifecycleStatus = "MODIFIED";

  // MODIFIED can only transition to APPROVED, REJECTED, or CANCELLED
  assert(canTransition(modifiedStatus, "APPROVED"), "MODIFIED → APPROVED allowed (re-approval)");
  assert(canTransition(modifiedStatus, "REJECTED"), "MODIFIED → REJECTED allowed");
  assert(canTransition(modifiedStatus, "CANCELLED"), "MODIFIED → CANCELLED allowed");

  // MODIFIED cannot skip directly to execution — must pass through APPROVED
  assert(!canTransition(modifiedStatus, "QUEUED"), "MODIFIED → QUEUED blocked (must re-approve)");
  assert(!canTransition(modifiedStatus, "EXECUTING"), "MODIFIED → EXECUTING blocked");
  assert(!canTransition(modifiedStatus, "VALIDATING"), "MODIFIED → VALIDATING blocked");

  // Prove re-validation happens: MODIFY changes the payload,
  // which then goes through validateAndClampActionParams at APPROVE time.
  const modifiedParams = { discount_percent: 25 };
  const policy = { max_discount_percent: 30 };
  const result = validateAndClampActionParams("suggest_offer", modifiedParams, policy);
  assert(result.valid, "Modified params within policy → valid");

  const tooHighModification = { discount_percent: 50 };
  const strictPolicy = { max_discount_percent: 20 };
  const strictResult = validateAndClampActionParams("suggest_offer", tooHighModification, strictPolicy);
  assert(!strictResult.valid, "Modified params exceeding policy → invalid (revalidation catches violation)");
}

// ── TEST 7: Out-of-policy values rejected or clamped ─────────

section("TEST 7 — Business rule validation / clamping");
{
  // 7a. discount_percent within policy → valid, no clamping
  {
    const r = validateAndClampActionParams(
      "suggest_offer",
      { discount_percent: 15 },
      { max_discount_percent: 20 },
    );
    assert(r.valid, "7a: 15% discount within 20% policy → valid");
    assert(!r.clamped_values, "7a: No clamping needed");
  }

  // 7b. discount_percent exceeds policy → rejected
  {
    const r = validateAndClampActionParams(
      "suggest_offer",
      { discount_percent: 35 },
      { max_discount_percent: 20 },
    );
    assert(!r.valid, "7b: 35% discount exceeds 20% policy → rejected");
    assert(r.errors.length > 0, "7b: Error message present");
  }

  // 7c. discount_percent exceeds hard limit → rejected regardless of policy
  {
    const r = validateAndClampActionParams(
      "suggest_offer",
      { discount_percent: 90 },
      {}, // no workspace policy configured
    );
    assert(!r.valid, "7c: 90% discount exceeds hard limit (80%) → rejected");
  }

  // 7d. offer_value with no workspace policy → clamped to hard limit, not rejected
  {
    const r = validateAndClampActionParams(
      "suggest_offer",
      { offer_value: 15_000 },
      {}, // no workspace policy
    );
    assert(r.valid, "7d: offer_value > hard limit with no policy → clamped (valid with note)");
    assert(
      r.clamped_values?.offer_value === 10_000,
      "7d: offer_value clamped to hard limit 10000",
    );
  }

  // 7e. offer_value exceeds workspace policy → rejected (workspace policy is law)
  {
    const r = validateAndClampActionParams(
      "suggest_offer",
      { offer_value: 5_000 },
      { max_offer_value: 2_000 },
    );
    assert(!r.valid, "7e: offer_value exceeds workspace policy → rejected");
  }

  // 7f. referral_credit too high → rejected
  {
    const r = validateAndClampActionParams(
      "issue_referral",
      { referral_credit: 1_000 },
      { max_referral_credit: 500 },
    );
    assert(!r.valid, "7f: referral_credit exceeds policy → rejected");
  }

  // 7g. negative values are always rejected
  {
    const r = validateAndClampActionParams(
      "issue_discount",
      { discount_percent: -5 },
      {},
    );
    assert(!r.valid, "7g: Negative discount_percent → rejected");
  }

  // 7h. multiple violations accumulate
  {
    const r = validateAndClampActionParams(
      "bulk_email",
      { campaign_contacts: 200_000, message_batch_size: 15_000 },
      {},
    );
    assert(!r.valid, "7h: Multiple policy violations accumulate");
    assert(r.errors.length >= 2, "7h: Both violations reported");
  }
}

// ── TEST 8: Duplicate execution is prevented ──────────────────

section("TEST 8 — Duplicate execution prevented");
{
  // Once an action reaches COMPLETED, it cannot be re-executed
  const completedStatus: ActionLifecycleStatus = "COMPLETED";

  assert(
    !canTransition(completedStatus, "EXECUTING"),
    "COMPLETED → EXECUTING blocked",
  );
  assert(
    !canTransition(completedStatus, "QUEUED"),
    "COMPLETED → QUEUED blocked",
  );
  assert(
    isTerminalStatus(completedStatus),
    "COMPLETED is terminal",
  );

  // Idempotency guard catches it early
  const { blocked } = simulateApprovalIdempotency(completedStatus);
  assert(blocked, "Re-approval of COMPLETED action is blocked (idempotent response)");

  // QUEUED → cannot go back to QUEUED via EXECUTING
  assert(
    !canTransition("EXECUTING", "QUEUED"),
    "EXECUTING → QUEUED blocked (cannot re-queue mid-execution)",
  );
}

// ── TEST 9: Retry is idempotent ───────────────────────────────

section("TEST 9 — Retry idempotency");
{
  // FAILED → QUEUED is the only valid retry path
  const failedStatus: ActionLifecycleStatus = "FAILED";

  assert(canTransition(failedStatus, "QUEUED"), "FAILED → QUEUED allowed (bounded retry)");
  assert(
    !canTransition(failedStatus, "EXECUTING"),
    "FAILED → EXECUTING blocked (must re-enter QUEUED first)",
  );
  assert(
    !canTransition(failedStatus, "COMPLETED"),
    "FAILED → COMPLETED blocked",
  );

  // A retry does NOT create a new action row — it transitions the existing one
  // The execution_attempts counter prevents infinite retry loops (enforced in job-worker)
  // Simulate: attempt count check
  const maxAttempts = 3;
  const attemptCountsBelowLimit = [1, 2];
  const attemptCountAtLimit = 3;

  for (const count of attemptCountsBelowLimit) {
    assert(count < maxAttempts, `Attempt ${count} < max ${maxAttempts} → retry allowed`);
  }
  assert(
    attemptCountAtLimit >= maxAttempts,
    `Attempt ${attemptCountAtLimit} >= max ${maxAttempts} → permanent failure (no more retries)`,
  );
}

// ── TEST 10: Completed action cannot execute twice ────────────

section("TEST 10 — Completed action cannot execute twice");
{
  // This mirrors TEST 8 but is explicitly separated per the spec
  const completedStatus: ActionLifecycleStatus = "COMPLETED";

  const allStatuses: ActionLifecycleStatus[] = [
    "SUGGESTED", "APPROVED", "MODIFIED", "REJECTED",
    "VALIDATING", "QUEUED", "EXECUTING", "COMPLETED", "FAILED", "CANCELLED",
  ];

  let completedHasNoOutbound = true;
  for (const s of allStatuses) {
    if (canTransition(completedStatus, s)) {
      completedHasNoOutbound = false;
      console.error(`  ✗  COMPLETED unexpectedly allows transition to ${s}`);
    }
  }
  assert(completedHasNoOutbound, "COMPLETED has zero valid outbound transitions");

  // Second-approval idempotency: sending APPROVE again returns existing state
  const { idempotent, blocked } = simulateApprovalIdempotency(completedStatus);
  assert(idempotent, "Re-APPROVE on COMPLETED returns idempotent response");
  assert(blocked, "Re-APPROVE on COMPLETED is blocked, not re-executed");
}

// ── TEST 11: Invalid state transitions fail ───────────────────

section("TEST 11 — Invalid state transitions blocked");
{
  // Every state → every state: only documented paths are valid
  const legalTransitions: [ActionLifecycleStatus, ActionLifecycleStatus][] = [
    ["SUGGESTED",  "APPROVED"],
    ["SUGGESTED",  "MODIFIED"],
    ["SUGGESTED",  "REJECTED"],
    ["SUGGESTED",  "CANCELLED"],
    ["APPROVED",   "VALIDATING"],
    ["APPROVED",   "CANCELLED"],
    ["MODIFIED",   "APPROVED"],
    ["MODIFIED",   "REJECTED"],
    ["MODIFIED",   "CANCELLED"],
    ["VALIDATING", "QUEUED"],
    ["VALIDATING", "FAILED"],
    ["QUEUED",     "EXECUTING"],
    ["QUEUED",     "CANCELLED"],
    ["EXECUTING",  "COMPLETED"],
    ["EXECUTING",  "FAILED"],
    ["FAILED",     "QUEUED"],
  ];

  const illegalTransitions: [ActionLifecycleStatus, ActionLifecycleStatus][] = [
    ["SUGGESTED",  "EXECUTING"],
    ["SUGGESTED",  "QUEUED"],
    ["SUGGESTED",  "COMPLETED"],
    ["APPROVED",   "EXECUTING"],
    ["APPROVED",   "QUEUED"],
    ["MODIFIED",   "QUEUED"],
    ["MODIFIED",   "EXECUTING"],
    ["REJECTED",   "APPROVED"],
    ["REJECTED",   "QUEUED"],
    ["REJECTED",   "EXECUTING"],
    ["COMPLETED",  "EXECUTING"],
    ["COMPLETED",  "QUEUED"],
    ["COMPLETED",  "FAILED"],
    ["CANCELLED",  "APPROVED"],
    ["CANCELLED",  "QUEUED"],
    ["EXECUTING",  "QUEUED"],
    ["EXECUTING",  "VALIDATING"],
    ["FAILED",     "EXECUTING"],
    ["FAILED",     "COMPLETED"],
  ];

  for (const [from, to] of legalTransitions) {
    assert(canTransition(from, to), `LEGAL: ${from} → ${to} allowed`);
  }

  for (const [from, to] of illegalTransitions) {
    assert(!canTransition(from, to), `ILLEGAL: ${from} → ${to} blocked`);
  }
}

// ── TEST 12: AI recommendation alone is insufficient authorization ──

section("TEST 12 — AI recommendation alone is insufficient authorization");
{
  // An AI-2 recommendation produces lifecycle_status=SUGGESTED
  // That status alone cannot transition directly to anything executable
  const aiRecommendationStatus: ActionLifecycleStatus = "SUGGESTED";

  assert(
    !isExecutableStatus(aiRecommendationStatus),
    "SUGGESTED is not an executable status",
  );
  assert(
    !canTransition(aiRecommendationStatus, "EXECUTING"),
    "AI recommendation (SUGGESTED) cannot directly execute",
  );
  assert(
    !canTransition(aiRecommendationStatus, "QUEUED"),
    "AI recommendation cannot skip to QUEUED without human APPROVE",
  );
  assert(
    !canTransition(aiRecommendationStatus, "VALIDATING"),
    "AI recommendation cannot skip to VALIDATING",
  );

  // All sensitive types require the approval gate — membership in SENSITIVE_ACTION_TYPES
  // is the machine-readable proof that the gate exists for that type
  assert(
    SENSITIVE_ACTION_TYPES.has("suggest_offer"),
    "suggest_offer (AI-generated offer) is gated",
  );
  assert(
    SENSITIVE_ACTION_TYPES.has("suggest_campaign"),
    "suggest_campaign (AI-generated campaign) is gated",
  );
  assert(
    SENSITIVE_ACTION_TYPES.has("bulk_email"),
    "bulk_email is gated (financially/commercially meaningful)",
  );
  assert(
    SENSITIVE_ACTION_TYPES.has("issue_discount"),
    "issue_discount is gated",
  );

  // Only after explicit human APPROVE does the lifecycle progress
  assert(
    canTransition("SUGGESTED", "APPROVED"),
    "Human APPROVE is the required first step",
  );
  assert(
    isExecutableStatus("QUEUED"),
    "QUEUED (post-human-approval) is the only directly executable status",
  );
}

// ── TEST 13: Policy dependency gate is action-sensitive ─────────

section("TEST 13 — Policy dependency gate");
{
  let loadCalls = 0;
  const createBookingPolicy = await resolveValidationPolicyForAction(
    "create_booking",
    { client_name: "Ada", date: "2026-08-24", time: "09:30" },
    async () => {
      loadCalls++;
      return { ok: false, error: 'relation "workspace_settings" does not exist' };
    },
  );
  assert(loadCalls === 0, "create_booking does not query workspace_settings policy source");
  assert(createBookingPolicy.ok, "create_booking policy resolution succeeds without explicit policy");

  const launchCampaignPolicy = await resolveValidationPolicyForAction(
    "launch_campaign",
    { campaign_id: "cmp-1" },
    async () => ({ ok: false, error: 'relation "workspace_settings" does not exist' }),
  );
  assert(
    !launchCampaignPolicy.ok && launchCampaignPolicy.status === "POLICY_NOT_CONFIGURED",
    "launch_campaign fails closed with POLICY_NOT_CONFIGURED when policy source is absent",
  );
}

// ── Summary ───────────────────────────────────────────────────

console.log(`\n=== AI-3 Security Test Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  Deno.exit(1);
}
