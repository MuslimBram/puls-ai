/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3E: REPAIR LOOP ENGINE
 *
 * Deterministically plans, routes, tracks, and controls repair loop iterations.
 *
 * STRICTLY PURE ENGINE:
 * - NO worker execution or dispatch
 * - NO builder-adapter-router modifications
 * - NO external HTTP, MCP, or provider API calls
 * - ZERO credits consumed
 */

import {
  TaskPlannerOutput,
  ContextPack,
  ExecutionPlan,
  QualityReport,
  JudgeDecision,
  WorkerResult,
  RepairPlan,
  RepairLoopState,
  RepairProblem,
  RepairContextDelta,
  RepairAttemptRecord,
  RepairProblemCategory,
  RepairStopCondition,
  WorkerType,
} from "./types";
import { getWorkerClass } from "./phase2bBridge";

/**
 * Generates a deterministic fingerprint hash string for a repair configuration.
 */
export function generateRepairFingerprint(
  taskId: string,
  targetWorker: string,
  categories: string[],
  strategy: string
): string {
  const sortedCat = [...categories].sort().join(",");
  const raw = `${taskId}:${targetWorker}:${sortedCat}:${strategy}`;

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(16)}`;
}

/**
 * Evaluates progress between two consecutive Quality Reports.
 * Returns progress metrics and boolean flag indicating whether meaningful progress was made.
 */
export function evaluateProgress(
  previousReport: QualityReport | null,
  newReport: QualityReport
): {
  meaningful_progress: boolean;
  blockers_resolved: number;
  score_delta: number;
  details: string;
} {
  if (!previousReport) {
    return {
      meaningful_progress: true,
      blockers_resolved: 0,
      score_delta: newReport.overall_score,
      details: "Initial evaluation report.",
    };
  }

  const prevBlockers = previousReport.violations.filter(
    (v) => v.severity === "critical" || v.severity === "high"
  ).length;
  const newBlockers = newReport.violations.filter(
    (v) => v.severity === "critical" || v.severity === "high"
  ).length;

  const blockersResolved = Math.max(0, prevBlockers - newBlockers);
  const scoreDelta = newReport.overall_score - previousReport.overall_score;

  // Check if build failure was fixed
  const prevBuildFail = previousReport.checks.some(
    (c) => c.type === "build" && c.status === "fail"
  );
  const newBuildPass = newReport.checks.some(
    (c) => c.type === "build" && c.status === "pass"
  );
  const buildFixed = prevBuildFail && newBuildPass;

  // Check if secret leak was removed
  const prevSecretLeak = previousReport.checks.some(
    (c) => c.type === "security" && c.status === "fail"
  );
  const newSecretPass = newReport.checks.some(
    (c) => c.type === "security" && c.status === "pass"
  );
  const secretFixed = prevSecretLeak && newSecretPass;

  // Meaningful progress requires: resolved blockers OR build fixed OR secret leak fixed
  // A higher numeric score alone with 0 resolved blockers is NOT progress!
  const meaningfulProgress = blockersResolved > 0 || buildFixed || secretFixed;

  return {
    meaningful_progress: meaningfulProgress,
    blockers_resolved: blockersResolved,
    score_delta: scoreDelta,
    details: meaningfulProgress
      ? `Progress achieved: ${blockersResolved} blocker(s) resolved, score delta +${scoreDelta}.`
      : "No meaningful progress: numeric score changed but blocking failures remain unresolved.",
  };
}

/**
 * Maps Quality Gate check violations to normalized RepairProblem objects.
 */
export function extractRepairProblems(
  qualityReport: QualityReport,
  judgeDecision: JudgeDecision
): RepairProblem[] {
  const problems: RepairProblem[] = [];

  qualityReport.violations.forEach((v, idx) => {
    let category: RepairProblemCategory = "missing_evidence";

    switch (v.check_type) {
      case "build":
        category = "build_failure";
        break;
      case "tests":
        category = "test_failure";
        break;
      case "lint":
        category = "lint_failure";
        break;
      case "security":
        category = "security_failure";
        break;
      case "runtime":
        category = "runtime_failure";
        break;
      case "browser":
        category = "browser_failure";
        break;
      case "acceptance_criteria":
        category = "acceptance_criteria" as RepairProblemCategory;
        break;
      case "isolation_integrity":
        category = "scope_violation";
        break;
      default:
        category = "missing_evidence";
        break;
    }

    problems.push({
      problem_id: `prob_${Date.now()}_${idx}`,
      category,
      severity: v.severity,
      source_worker: v.worker_id || qualityReport.rejected_workers[0] || "claude_code",
      affected_area: v.check_type,
      evidence: [v.message],
      expected_behavior: `Check ${v.check_type} must pass without violations.`,
      actual_behavior: v.message,
      recommended_action: `Repair ${v.check_type} failure in source area.`,
    });
  });

  return problems;
}

/**
 * Creates a lean Repair Context Delta excluding repository noise.
 */
export function createRepairContextDelta(
  qualityReport: QualityReport,
  problems: RepairProblem[],
  taskPlan: TaskPlannerOutput
): RepairContextDelta {
  const failedChecks = qualityReport.checks
    .filter((c) => c.status === "fail")
    .map((c) => `${c.type}: ${c.reason}`);

  const relevantLogs = problems.flatMap((p) => p.evidence);

  return {
    failed_checks: failedChecks,
    relevant_logs: relevantLogs,
    affected_files_or_areas: taskPlan.likely_files_or_areas,
    unmet_acceptance_criteria: taskPlan.acceptance_criteria,
    previous_attempt_summary: qualityReport.recommended_action || "Previous execution failed quality checks.",
    constraints: taskPlan.forbidden_actions,
    prohibited_actions: ["DO_NOT_TARGET_MAIN_BRANCH", "DO_NOT_EXPOSE_SECRETS"],
    evidence_required_after_repair: ["Clean build output", "100% test pass rate", "Zero security violations"],
  };
}

/**
 * Creates a deterministic RepairPlan.
 */
export function createRepairPlan(
  taskPlan: TaskPlannerOutput,
  contextPack: ContextPack,
  execPlan: ExecutionPlan,
  qualityReport: QualityReport,
  judgeDecision: JudgeDecision,
  existingState: RepairLoopState | null = null
): RepairPlan {
  const attemptNumber = existingState ? existingState.current_attempt + 1 : 1;
  const maxAttempts = 2; // Default max attempts (hard max 3)
  const isNoSpend = !taskPlan.budget_policy.allow_spend;

  // If Judge selected a clean base without repair needed
  if (judgeDecision.decision === "select_base") {
    const planId = `rp_${Date.now()}_clean`;
    return {
      repair_plan_id: planId,
      execution_id: execPlan.execution_id,
      task_id: taskPlan.task_id,
      source_judge_decision_id: judgeDecision.judge_decision_id,
      repair_required: false,
      repair_reason: "Base candidate selected cleanly by Judge. No repair required.",
      target_worker: judgeDecision.selected_base_worker,
      source_worker: judgeDecision.selected_base_worker,
      repair_strategy: "none",
      problems: [],
      patches_to_consider: judgeDecision.patch_candidates,
      context_delta: createRepairContextDelta(qualityReport, [], taskPlan),
      required_evidence: [],
      attempt_number: attemptNumber,
      max_attempts: maxAttempts,
      budget_policy: taskPlan.budget_policy,
      estimated_external_calls: 0,
      human_approval_required: false,
      dispatch_allowed: false,
      blocked_reason: null,
      stop_condition: "not_required",
      created_at: new Date().toISOString(),
    };
  }

  // Extract problems
  const problems = extractRepairProblems(qualityReport, judgeDecision);
  const categories = problems.map((p) => p.category);

  // Target repair worker recommendation
  let targetWorker: WorkerType = "antigravity_candidate";
  if (judgeDecision.repair_candidates.length > 0) {
    targetWorker = judgeDecision.repair_candidates[0].recommended_repair_worker;
  } else if (taskPlan.task_type === "debugging") {
    targetWorker = "antigravity_candidate";
  } else if (taskPlan.task_type === "backend" || taskPlan.task_type === "security") {
    targetWorker = isNoSpend ? "antigravity_candidate" : "claude_code";
  }

  const sourceWorker = judgeDecision.selected_base_worker || qualityReport.rejected_workers[0] || "claude_code";
  const repairStrategy = `repair_${taskPlan.task_type}_by_${targetWorker}`;
  const fingerprint = generateRepairFingerprint(taskPlan.task_id, targetWorker, categories, repairStrategy);

  // Check Anti-Loop Fingerprint against history
  let repeatedFingerprint = false;
  if (existingState && existingState.history.some((h) => h.fingerprint === fingerprint)) {
    repeatedFingerprint = true;
  }

  // Evaluate Budget Policy & No-Spend Protection
  let dispatchAllowed = true;
  let blockedReason: string | null = null;
  let externalCalls = 0;

  if (repeatedFingerprint) {
    dispatchAllowed = false;
    blockedReason = "repeated_failed_repair";
  } else if (targetWorker !== "antigravity_candidate") {
    externalCalls = 1;
    if (isNoSpend) {
      dispatchAllowed = false;
      blockedReason = "budget_or_connection_required";
    }
  }

  if (attemptNumber > 3) {
    dispatchAllowed = false;
    blockedReason = "max_attempts_exceeded";
  }

  // Evaluate Human Approval Requirements
  const approvalReasons: string[] = [];
  let humanApprovalRequired = false;

  if (taskPlan.task_type === "security") {
    humanApprovalRequired = true;
    approvalReasons.push("Security tasks require human approval.");
  }
  if (taskPlan.target_environment === "production") {
    humanApprovalRequired = true;
    approvalReasons.push("Production environment repair requires human approval.");
  }
  if (judgeDecision.requires_human_review) {
    humanApprovalRequired = true;
    approvalReasons.push("Pulse Judge requested human review.");
  }
  if (repeatedFingerprint) {
    humanApprovalRequired = true;
    approvalReasons.push("Repeated repair fingerprint detected.");
  }
  if (attemptNumber >= maxAttempts) {
    humanApprovalRequired = true;
    approvalReasons.push(`Max attempt threshold (${attemptNumber}/${maxAttempts}) reached.`);
  }

  // Check patch candidates from rejected workers with security violations
  const safePatches = judgeDecision.patch_candidates.filter((patch) => {
    const isRejectedSecurity = qualityReport.worker_results.some(
      (w) => w.worker_id === patch.source_worker && w.violations.some((v) => v.check_type === "security")
    );
    return !isRejectedSecurity;
  });

  let stopCondition: RepairStopCondition | null = null;
  if (attemptNumber > 3) stopCondition = "max_attempts_exceeded";
  else if (repeatedFingerprint) stopCondition = "repeated_repair_fingerprint";
  else if (humanApprovalRequired) stopCondition = "human_approval_required";

  const contextDelta = createRepairContextDelta(qualityReport, problems, taskPlan);
  const planId = `rp_${Date.now()}_${attemptNumber}`;

  return {
    repair_plan_id: planId,
    execution_id: execPlan.execution_id,
    task_id: taskPlan.task_id,
    source_judge_decision_id: judgeDecision.judge_decision_id,
    repair_required: true,
    repair_reason: `Quality Gate & Judge requested repair (${problems.length} problem(s) identified).`,
    target_worker: targetWorker,
    source_worker: sourceWorker,
    repair_strategy: repairStrategy,
    problems,
    patches_to_consider: safePatches,
    context_delta: contextDelta,
    required_evidence: contextDelta.evidence_required_after_repair,
    attempt_number: attemptNumber,
    max_attempts: maxAttempts,
    budget_policy: taskPlan.budget_policy,
    estimated_external_calls: externalCalls,
    human_approval_required: humanApprovalRequired,
    dispatch_allowed: dispatchAllowed && !humanApprovalRequired,
    blocked_reason: blockedReason,
    stop_condition: stopCondition,
    created_at: new Date().toISOString(),
  };
}

/**
 * Initializes or updates RepairLoopState.
 */
export function evaluateRepairLoopState(
  taskPlan: TaskPlannerOutput,
  contextPack: ContextPack,
  execPlan: ExecutionPlan,
  qualityReport: QualityReport,
  judgeDecision: JudgeDecision,
  previousState: RepairLoopState | null = null
): RepairLoopState {
  const currentPlan = createRepairPlan(taskPlan, contextPack, execPlan, qualityReport, judgeDecision, previousState);
  const currentAttempt = currentPlan.attempt_number;

  const history: RepairAttemptRecord[] = previousState ? [...previousState.history] : [];

  if (previousState && currentPlan.repair_required) {
    const progress = evaluateProgress(null, qualityReport);
    history.push({
      attempt: currentAttempt - 1,
      plan_id: currentPlan.repair_plan_id,
      target_worker: currentPlan.target_worker || "antigravity_candidate",
      fingerprint: generateRepairFingerprint(
        taskPlan.task_id,
        currentPlan.target_worker || "antigravity_candidate",
        currentPlan.problems.map((p) => p.category),
        currentPlan.repair_strategy
      ),
      quality_report_id: qualityReport.quality_report_id,
      judge_decision_id: judgeDecision.judge_decision_id,
      problems_count: currentPlan.problems.length,
      blockers_resolved: progress.blockers_resolved,
      score_delta: progress.score_delta,
      made_meaningful_progress: progress.meaningful_progress,
      timestamp: new Date().toISOString(),
    });
  }

  let status: RepairLoopState["status"] = "planned";
  let stopReason: string | null = null;

  if (!currentPlan.repair_required) {
    status = "not_required";
    stopReason = "No repair required; base worker selected cleanly.";
  } else if (currentPlan.stop_condition === "max_attempts_exceeded" || currentAttempt > 3) {
    status = "exhausted";
    stopReason = "Max repair attempts (3) exceeded.";
  } else if (currentPlan.blocked_reason === "repeated_failed_repair") {
    status = "blocked";
    stopReason = "Repeated repair fingerprint detected.";
  } else if (currentPlan.human_approval_required) {
    status = "awaiting_human_approval";
    stopReason = `Human approval required: ${currentPlan.blocked_reason || "Safety gate triggered."}`;
  } else if (currentPlan.dispatch_allowed) {
    status = "ready_for_dispatch";
  } else {
    status = "blocked";
    stopReason = currentPlan.blocked_reason || "Dispatch not allowed by policy.";
  }

  const loopId = previousState ? previousState.loop_id : `loop_${Date.now()}`;

  return {
    loop_id: loopId,
    task_id: taskPlan.task_id,
    execution_id: execPlan.execution_id,
    status,
    current_attempt: currentAttempt,
    max_attempts: 2,
    history,
    current_plan: currentPlan,
    resolved_problems: [],
    remaining_problems: currentPlan.problems.map((p) => p.problem_id),
    last_quality_report_id: qualityReport.quality_report_id,
    last_judge_decision_id: judgeDecision.judge_decision_id,
    requires_human_review: currentPlan.human_approval_required,
    stop_reason: stopReason,
    created_at: previousState ? previousState.created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
