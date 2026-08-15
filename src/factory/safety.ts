/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3A: FAIL-CLOSED SAFETY GUARD
 *
 * Enforces strict safety validation. The planner MUST fail closed for:
 * - Missing workspace authorization
 * - Missing repository/ref
 * - Ambiguous destructive task
 * - Production modification / deploy request without human approval
 * - Paid execution when budget policy forbids spend
 * - Unknown task types
 */

import { SoftwareTaskInput, SafetyValidationResult, TaskType } from "./types";

export const SUPPORTED_TASK_TYPES: TaskType[] = [
  "ui",
  "backend",
  "debugging",
  "refactor",
  "integration",
  "security",
  "database",
  "full_prototype",
];

const AMBIGUOUS_DESTRUCTIVE_PATTERNS = [
  /wipe\s+(database|db|repo|repository|all)/i,
  /drop\s+(database|schema|table|all)/i,
  /delete\s+(production|prod|database|all\s+data)/i,
  /destroy\s+(repo|repository|environment|infra)/i,
  /truncate\s+(table|database|all)/i,
  /force\s+purge/i,
  /rm\s+-rf\s+\//i,
];

const DEPLOY_PRODUCTION_PATTERNS = [
  /deploy\s+to\s+(production|prod)/i,
  /modify\s+production/i,
  /update\s+prod/i,
  /push\s+to\s+production/i,
  /production\s+deploy/i,
  /release\s+to\s+prod/i,
];

export class TaskPlannerSafetyError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TaskPlannerSafetyError";
    this.code = code;
  }
}

/**
 * Validates task safety. Throws TaskPlannerSafetyError if any safety check fails (fail-closed).
 */
export function validateTaskSafety(input: SoftwareTaskInput): SafetyValidationResult {
  // 1. Missing workspace authorization
  if (!input.workspace_id || input.workspace_id.trim() === "") {
    throw new TaskPlannerSafetyError(
      "Safety failure: Missing workspace authorization ID.",
      "MISSING_WORKSPACE_AUTHORIZATION"
    );
  }

  // 2. Missing repository / ref
  const repo = input.repository || input.ref;
  if (!repo || repo.trim() === "") {
    throw new TaskPlannerSafetyError(
      "Safety failure: Missing target repository or ref.",
      "MISSING_REPOSITORY"
    );
  }

  // 3. Unknown task type (if provided explicitly)
  if (input.task_type) {
    const normalizedType = input.task_type.trim().toLowerCase();
    if (!SUPPORTED_TASK_TYPES.includes(normalizedType as TaskType)) {
      throw new TaskPlannerSafetyError(
        `Safety failure: Unknown or unsupported task type '${input.task_type}'.`,
        "UNKNOWN_TASK_TYPE"
      );
    }
  }

  // 4. Ambiguous destructive task
  const objective = input.objective || "";
  for (const pattern of AMBIGUOUS_DESTRUCTIVE_PATTERNS) {
    if (pattern.test(objective)) {
      if (!input.human_approved) {
        throw new TaskPlannerSafetyError(
          `Safety failure: Ambiguous destructive task detected in objective without explicit human approval: "${objective}"`,
          "AMBIGUOUS_DESTRUCTIVE_TASK"
        );
      }
    }
  }

  // 5. Production modification / deploy without human approval
  const isProdTarget = input.target_environment === "production";
  const hasProdKeyword = DEPLOY_PRODUCTION_PATTERNS.some((p) => p.test(objective));

  if ((isProdTarget || hasProdKeyword) && !input.human_approved) {
    throw new TaskPlannerSafetyError(
      "Safety failure: Production modification or deployment request requires explicit human approval.",
      "PRODUCTION_MODIFICATION_REQUIRES_APPROVAL"
    );
  }

  // 6. Paid execution requested when budget policy forbids spend
  if (input.requested_budget?.allow_spend || (input.requested_budget?.max_credits && input.requested_budget.max_credits > 0)) {
    throw new TaskPlannerSafetyError(
      "Safety failure: Paid execution / credit spend requested, but active budget policy strictly forbids external spend (ZERO_COST_POLICY).",
      "PAID_EXECUTION_FORBIDDEN"
    );
  }

  return {
    passed: true,
  };
}
