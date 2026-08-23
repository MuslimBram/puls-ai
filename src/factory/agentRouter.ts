/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3B: MULTI-BUILDER / AGENT ROUTER ENGINE
 *
 * Deterministically routes TaskPlan + ContextPack into a safe, normalized ExecutionPlan.
 *
 * Support Candidate Workers:
 *   - frontend_builder_candidate         (Builder, Phase 2B adapter)
 *   - emergent_mcp        (Builder, Phase 2B adapter)
 *   - base44_mcp          (Builder, Phase 2B adapter)
 *   - replit_mcp          (Builder, Phase 2B adapter)
 *   - claude_code         (Engineering Agent, Phase 2B adapter)
 *   - antigravity_candidate (Engineering Agent, Local candidate, no Phase 2B adapter)
 *
 * DOES NOT DISPATCH OR EXECUTE WORKERS.
 * ZERO HTTP/MCP CALLS. ZERO CREDITS CONSUMED.
 */

import {
  TaskPlannerOutput,
  ContextPack,
  ExecutionPlan,
  SelectedWorkerConfig,
  RoutingStrategy,
  WorkerType,
  WorkerRole,
  IsolationStrategy,
  ExecutionMode,
} from "./types";
import {
  getPhase2BAdapterKey,
  getWorkerClass,
  isExternalCallRequired,
} from "./phase2bBridge";
import { validateTaskSafety, TaskPlannerSafetyError } from "./safety";

export const MAX_ROUTER_WORKERS = 3;

/**
 * Determines the routing strategy based on task type, risk, and worker count.
 */
export function determineRoutingStrategy(
  taskType: string,
  workerCount: number,
  hasAntigravity: boolean
): RoutingStrategy {
  if (workerCount === 1) {
    return "single_worker";
  }

  switch (taskType) {
    case "ui":
      return "parallel_compare";

    case "backend":
      return "primary_plus_reviewer";

    case "debugging":
      return hasAntigravity ? "primary_plus_repair" : "primary_plus_reviewer";

    case "full_prototype":
      return "parallel_compare";

    case "security":
      return "primary_plus_reviewer";

    case "database":
      return "specialist_pair";

    case "refactor":
      return "primary_plus_reviewer";

    case "integration":
      return "specialist_pair";

    default:
      return "primary_plus_reviewer";
  }
}

/**
 * Infers appropriate capabilities array for a given worker identity.
 */
export function getWorkerCapabilities(workerId: WorkerType): string[] {
  switch (workerId) {
    case "frontend_builder_candidate":
      return ["react_components", "ui_design", "css_layout", "frontend_build"];

    case "emergent_mcp":
      return ["backend_logic", "job_execution", "async_tasks", "api_handlers"];

    case "base44_mcp":
      return ["layout_builder", "entity_schema", "base44_app_components"];

    case "replit_mcp":
      return ["prompt_app_generation", "sandbox_execution", "quick_prototyping"];

    case "claude_code":
      return ["code_analysis", "deep_refactoring", "security_auditing", "test_writing"];

    case "antigravity_candidate":
      return [
        "code_implementation",
        "debugging",
        "build_test_execution",
        "browser_verification",
        "repair_work",
        "repository_inspection",
      ];

    default:
      return ["code_modification"];
  }
}

/**
 * Infers isolation strategy for a worker. Never targets main branch directly.
 */
export function determineIsolationStrategy(
  workerId: WorkerType,
  taskType: string
): IsolationStrategy {
  if (workerId === "antigravity_candidate") {
    return "git_worktree";
  }
  if (workerId === "replit_mcp") {
    return "sandbox";
  }
  if (taskType === "full_prototype" || workerId === "base44_mcp") {
    return "remote_builder_project";
  }
  return "git_branch";
}

/**
 * Configures an individual selected worker for the ExecutionPlan.
 */
export function configureSelectedWorker(
  workerId: WorkerType,
  index: number,
  totalWorkers: number,
  taskType: string,
  allowSpend: boolean
): SelectedWorkerConfig {
  const workerClass = getWorkerClass(workerId);
  const adapterKey = getPhase2BAdapterKey(workerId);
  const requiresExternal = isExternalCallRequired(workerId);

  let role: WorkerRole = "primary_builder";
  if (index === 0) {
    role = workerClass === "builder" ? "primary_builder" : "repair_agent";
  } else if (index === 1) {
    role = workerClass === "engineering_agent" ? "reviewer" : "secondary_builder";
  } else {
    role = "inspection_agent";
  }

  let executionMode: ExecutionMode = "planning";
  if (!allowSpend && requiresExternal) {
    executionMode = "blocked_by_budget";
  } else if (workerId === "antigravity_candidate") {
    executionMode = "locally_available";
  } else if (!allowSpend) {
    executionMode = "credit_required";
  }

  const isolationStrategy = determineIsolationStrategy(workerId, taskType);
  const capabilities = getWorkerCapabilities(workerId);

  return {
    worker_id: workerId,
    worker_class: workerClass,
    role,
    priority: index + 1,
    capabilities,
    reason_selected: `Selected as candidate ${workerClass} (${role}) for ${taskType} task.`,
    execution_mode: executionMode,
    requires_external_call: requiresExternal,
    requires_paid_credit: requiresExternal && allowSpend,
    requires_connection: requiresExternal,
    isolation_strategy: isolationStrategy,
    context_scope: `Scope limited to task ${taskType} and target files.`,
    adapter_key: adapterKey,
  };
}

/**
 * Creates a safe, deterministic ExecutionPlan from a TaskPlan and ContextPack.
 *
 * DOES NOT DISPATCH OR EXECUTE WORKERS.
 */
export function createExecutionPlan(
  plan: TaskPlannerOutput,
  contextPack: ContextPack
): ExecutionPlan {
  // Fail-closed validation for workspace and repository
  if (!plan.workspace_id || plan.workspace_id.trim() === "") {
    throw new TaskPlannerSafetyError(
      "Safety failure: Missing workspace authorization ID in ExecutionPlan creation.",
      "MISSING_WORKSPACE_AUTHORIZATION"
    );
  }
  if (!plan.repository || plan.repository.trim() === "") {
    throw new TaskPlannerSafetyError(
      "Safety failure: Missing repository in ExecutionPlan creation.",
      "MISSING_REPOSITORY"
    );
  }

  const recommendedWorkers = plan.recommended_workers.slice(0, MAX_ROUTER_WORKERS);
  const hasAntigravity = recommendedWorkers.includes("antigravity_candidate");

  const strategy = determineRoutingStrategy(
    plan.task_type,
    recommendedWorkers.length,
    hasAntigravity
  );

  const selectedWorkers: SelectedWorkerConfig[] = recommendedWorkers.map((wId, idx) =>
    configureSelectedWorker(
      wId,
      idx,
      recommendedWorkers.length,
      plan.task_type,
      plan.budget_policy.allow_spend
    )
  );

  const workerOrder = selectedWorkers.map((w) => `${w.worker_id}:${w.role}`);

  // Build parallel execution groups
  const parallelGroups: string[][] = [];
  if (strategy === "parallel_compare") {
    parallelGroups.push(selectedWorkers.map((w) => w.worker_id));
  } else {
    // Sequential execution order in groups
    for (const worker of selectedWorkers) {
      parallelGroups.push([worker.worker_id]);
    }
  }

  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const contextPackId = contextPack.task_id || plan.task_id;

  const expectedOutputs = [
    `Implementation plan and code changes for task: ${plan.normalized_objective}`,
    `Unit test verification results (${plan.tests_required.join(", ")})`,
    "Clean static analysis / type check compliance",
  ];

  const qualityRequirements = [
    "Zero syntax or TypeScript compilation errors",
    "Zero regressions in existing test suite",
    "Strict adherence to zero-cost no-spend policy",
  ];

  // No-Spend Gate & Human Approval Gate evaluation
  const anyWorkerRequiresExternal = selectedWorkers.some((w) => w.requires_external_call);
  const isNoSpend = !plan.budget_policy.allow_spend;
  const requiresHumanApproval = plan.human_approval_required.required;

  let dispatchAllowed = true;
  let blockedReason: string | null = null;

  if (isNoSpend && anyWorkerRequiresExternal) {
    dispatchAllowed = false;
    blockedReason = "NO_SPEND_POLICY_ACTIVE: External worker dispatch blocked under zero-cost budget policy.";
  } else if (requiresHumanApproval) {
    dispatchAllowed = false;
    blockedReason = "HUMAN_APPROVAL_REQUIRED: Execution plan requires explicit human approval before dispatch.";
  }

  const productionAllowed = plan.human_approval_required.required && plan.risk_level === "low";

  return {
    execution_id: executionId,
    task_id: plan.task_id,
    workspace_id: plan.workspace_id,
    repository: plan.repository,
    ref: plan.ref,
    task_type: plan.task_type,
    strategy,
    selected_workers: selectedWorkers,
    worker_order: workerOrder,
    parallel_groups: parallelGroups,
    context_pack_id: contextPackId,
    expected_outputs: expectedOutputs,
    quality_requirements: qualityRequirements,
    budget_policy: plan.budget_policy,
    estimated_external_calls: 0, // Phase 3B estimates zero external calls
    human_approval_required: plan.human_approval_required,
    production_allowed: false, // Never allowed in Phase 3B
    dispatch_allowed: dispatchAllowed,
    blocked_reason: blockedReason,
    created_at: new Date().toISOString(),
  };
}
