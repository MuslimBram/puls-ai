/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3A: TASK PLANNER ENGINE
 *
 * Deterministic planning layer that receives a software task request,
 * enforces fail-closed safety checks, normalizes the objective and criteria,
 * estimates risk and complexity, applies worker selection policy,
 * and produces a complete TaskPlannerOutput structure.
 *
 * DOES NOT DISPATCH TO BUILDERS OR CALL EXTERNAL PROVIDERS.
 */

import {
  SoftwareTaskInput,
  TaskPlannerOutput,
  TaskType,
  RiskLevel,
  EstimatedComplexity,
  BudgetCostPolicy,
  HumanApprovalRequirements,
} from "./types";
import { validateTaskSafety } from "./safety";
import { recommendWorkers } from "./workerSelectionPolicy";

/**
 * Classifies task type deterministically from objective if not explicitly provided.
 */
export function classifyTaskType(objective: string, explicitType?: string): TaskType {
  if (explicitType) {
    return explicitType.trim().toLowerCase() as TaskType;
  }

  const text = objective.toLowerCase();

  if (/\b(page|component|button|layout|css|ui|react|view|form|modal|design|theme)\b/.test(text)) {
    return "ui";
  }
  if (/\b(api|endpoint|function|route|controller|service|backend|middleware)\b/.test(text)) {
    return "backend";
  }
  if (/\b(fix|bug|error|issue|fail|crash|broken|debug|trace|exception)\b/.test(text)) {
    return "debugging";
  }
  if (/\b(refactor|clean|rename|extract|optimize|restructure)\b/.test(text)) {
    return "refactor";
  }
  if (/\b(webhook|provider|third-party|oauth|external|integration|connector)\b/.test(text)) {
    return "integration";
  }
  if (/\b(auth|token|jwt|rls|encrypt|security|permission|vault|audit)\b/.test(text)) {
    return "security";
  }
  if (/\b(migration|sql|table|column|index|query|schema|database|postgres|supabase)\b/.test(text)) {
    return "database";
  }
  if (/\b(prototype|fullstack|end-to-end|system|complete app|full app)\b/.test(text)) {
    return "full_prototype";
  }

  return "backend"; // default deterministic fallback
}

/**
 * Estimates complexity deterministically based on objective length and scope keywords.
 */
export function estimateComplexity(objective: string, taskType: TaskType): EstimatedComplexity {
  const text = objective.toLowerCase();

  if (taskType === "full_prototype" || text.includes("complete system") || text.includes("end-to-end")) {
    return "XL";
  }
  if (taskType === "security" || taskType === "refactor" || text.includes("architecture") || text.includes("migration")) {
    return "L";
  }
  if (taskType === "backend" || taskType === "integration" || taskType === "database") {
    return "M";
  }
  if (taskType === "ui" || taskType === "debugging") {
    return text.length > 100 ? "M" : "S";
  }

  return "S";
}

/**
 * Estimates risk level deterministically based on target environment, task type, and objective keywords.
 */
export function estimateRiskLevel(input: SoftwareTaskInput, taskType: TaskType): RiskLevel {
  const text = (input.objective || "").toLowerCase();

  if (input.target_environment === "production" || text.includes("production") || text.includes("prod")) {
    return "critical";
  }
  if (taskType === "security" || taskType === "database" || text.includes("auth") || text.includes("payment") || text.includes("crypto")) {
    return "high";
  }
  if (taskType === "backend" || taskType === "integration" || taskType === "refactor") {
    return "medium";
  }

  return "low";
}

/**
 * Extracts acceptance criteria from objective or generates default criteria.
 */
export function extractAcceptanceCriteria(objective: string, taskType: TaskType): string[] {
  const criteria: string[] = [];

  // Parse bullet points if present in objective
  const lines = objective.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-") || trimmed.startsWith("*") || /^\d+\./.test(trimmed)) {
      criteria.push(trimmed.replace(/^[-*\d.]+\s*/, ""));
    }
  }

  if (criteria.length === 0) {
    criteria.push(`Objective must be fully implemented: ${objective.trim()}`);
    criteria.push(`All code must pass static type checking and build step.`);
    criteria.push(`Zero cost execution policy must be strictly observed.`);

    if (taskType === "ui") {
      criteria.push("UI components must render properly and be visually clean.");
    } else if (taskType === "backend" || taskType === "database") {
      criteria.push("Backend endpoints and database queries must adhere to existing contract interfaces.");
    }
  }

  return criteria;
}

/**
 * Infers required capabilities for the task.
 */
export function inferRequiredCapabilities(taskType: TaskType): string[] {
  switch (taskType) {
    case "ui":
      return ["react_components", "tailwind_css", "typescript_types"];
    case "backend":
      return ["api_design", "typescript", "async_handlers"];
    case "debugging":
      return ["code_analysis", "test_execution", "stacktrace_inspection"];
    case "refactor":
      return ["code_restructuring", "interface_preservation", "type_safety"];
    case "integration":
      return ["oauth_flow", "webhook_handling", "external_api_contract"];
    case "security":
      return ["jwt_auth", "rls_policies", "security_hardening"];
    case "database":
      return ["sql_migrations", "schema_design", "supabase_rls"];
    case "full_prototype":
      return ["fullstack_react_supabase", "ui_design", "database_schema", "api_routes"];
    default:
      return ["typescript", "code_modification"];
  }
}

/**
 * Infers likely files or areas involved based on task type and objective.
 */
export function inferLikelyFiles(objective: string, taskType: TaskType): string[] {
  const files: string[] = [];
  const text = objective.toLowerCase();

  if (text.includes("router") || text.includes("adapter")) {
    files.push("supabase/functions/builder-adapter-router/index.ts");
  }

  switch (taskType) {
    case "ui":
      files.push("src/components/", "src/pages/");
      break;
    case "backend":
      files.push("supabase/functions/", "src/services/");
      break;
    case "database":
      files.push("supabase/migrations/", "src/integrations/supabase/");
      break;
    case "security":
      files.push("supabase/migrations/", "supabase/functions/", "src/lib/security/");
      break;
    default:
      files.push("src/factory/", "src/");
      break;
  }

  return Array.from(new Set(files));
}

/**
 * Deterministically creates a TaskPlannerOutput from a SoftwareTaskInput.
 */
export function createTaskPlan(input: SoftwareTaskInput): TaskPlannerOutput {
  // 1. Fail-closed safety validation
  validateTaskSafety(input);

  const taskId = input.task_id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const workspaceId = input.workspace_id || "";
  const repositoryRef = input.repository || "PulseAI/puls-ai";
  const gitRef = input.ref || "main";
  const repoFormatted = `${repositoryRef}@${gitRef}`;

  const taskType = classifyTaskType(input.objective, input.task_type);
  const normalizedObjective = input.objective.trim();
  const complexity = estimateComplexity(normalizedObjective, taskType);
  const riskLevel = estimateRiskLevel(input, taskType);

  const acceptanceCriteria = extractAcceptanceCriteria(normalizedObjective, taskType);
  const requiredCapabilities = inferRequiredCapabilities(taskType);

  // Apply Worker Selection Policy (Planning Only, max 2-3 workers)
  const workerPolicyResult = recommendWorkers(taskType, complexity, riskLevel);

  const likelyFiles = inferLikelyFiles(normalizedObjective, taskType);

  const testsRequired = [
    "npm run build",
    "npm run lint",
    "npm run test",
  ];

  const forbiddenActions = [
    "no_production_deploy",
    "no_external_credits",
    "no_paid_provider_calls",
    "no_unauthorized_database_wipes",
    "no_main_branch_direct_merge",
  ];

  const budgetPolicy: BudgetCostPolicy = {
    allow_spend: false,
    max_credits: 0,
    currency: "USD",
    policy_name: "ZERO_COST_POLICY",
  };

  const isProduction = input.target_environment === "production";
  const humanApprovalRequired: HumanApprovalRequirements = {
    required: isProduction || riskLevel === "critical",
    reasons: isProduction
      ? ["Target environment is set to production."]
      : riskLevel === "critical"
      ? ["Task risk level is rated critical."]
      : [],
  };

  return {
    task_id: taskId,
    workspace_id: workspaceId,
    repository: repoFormatted,
    ref: gitRef,
    task_type: taskType,
    normalized_objective: normalizedObjective,
    acceptance_criteria: acceptanceCriteria,
    required_capabilities: requiredCapabilities,
    risk_level: riskLevel,
    complexity,
    recommended_workers: workerPolicyResult.recommended_workers,
    worker_count: workerPolicyResult.worker_count,
    likely_files_or_areas: likelyFiles,
    tests_required: testsRequired,
    forbidden_actions: forbiddenActions,
    budget_policy: budgetPolicy,
    human_approval_required: humanApprovalRequired,
  };
}
