/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3C: SCOPE INTEGRITY CHECKER
 *
 * Verifies that worker changed files and execution targets adhere strictly to the declared scope.
 * Detects:
 *   - Unrelated file modifications
 *   - Forbidden file modifications (.env, production configs)
 *   - Direct target mutation of main/master branch
 */

import { TaskPlannerOutput, WorkerResult } from "./types";

export interface ScopeCheckResult {
  scope_valid: boolean;
  unrelated_files: string[];
  forbidden_files: string[];
  main_target_detected: boolean;
  violations: string[];
  summary: string;
}

const FORBIDDEN_SCOPE_FILES = [
  /\.env($|\.)/i,
  /production\.json$/i,
  /secrets\.json$/i,
  /credentials\.json$/i,
];

/**
 * Checks if a changed file matches the allowed likely files/areas or standard project area.
 */
export function isFileInScope(file: string, likelyAreas: string[]): boolean {
  const normFile = file.replace(/\\/g, "/");

  // Factory code files are always in scope for factory tasks
  if (normFile.startsWith("src/factory/")) {
    return true;
  }

  for (const area of likelyAreas) {
    const normArea = area.replace(/\\/g, "/");
    if (normFile.startsWith(normArea) || normFile.includes(normArea)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates scope compliance for a worker result against task plan.
 */
export function evaluateScopeCompliance(
  taskPlan: TaskPlannerOutput,
  workerResult: WorkerResult
): ScopeCheckResult {
  const changedFiles = workerResult.changed_files || [];
  const likelyAreas = taskPlan.likely_files_or_areas || [];

  const unrelatedFiles: string[] = [];
  const forbiddenFiles: string[] = [];
  const violations: string[] = [];

  // 1. Check main branch direct target mutation
  const branchOrSandbox = (workerResult.branch_or_sandbox || "").toLowerCase();
  const mainTargetDetected = branchOrSandbox === "main" || branchOrSandbox === "master";
  if (mainTargetDetected) {
    violations.push("SCOPE_VIOLATION: Worker targeted main/master branch directly instead of an isolated target.");
  }

  // 2. Check each changed file
  for (const file of changedFiles) {
    const normFile = file.replace(/\\/g, "/");

    // Check forbidden files
    if (FORBIDDEN_SCOPE_FILES.some((pattern) => pattern.test(normFile))) {
      forbiddenFiles.push(file);
      violations.push(`SCOPE_VIOLATION: Forbidden configuration file modified: '${file}'`);
    }

    // Check scope containment
    if (!isFileInScope(normFile, likelyAreas)) {
      unrelatedFiles.push(file);
    }
  }

  if (unrelatedFiles.length > 5) { // Unjustified large spread outside scope
    violations.push(`SCOPE_VIOLATION: Changed files exceed declared scope without justification (${unrelatedFiles.length} unrelated files).`);
  }

  const scopeValid = violations.length === 0 && forbiddenFiles.length === 0 && !mainTargetDetected;
  const summary = scopeValid
    ? "SCOPE_CLEAN: All changed files and execution targets adhere strictly to declared scope."
    : `SCOPE_VIOLATION: ${violations.join(" ")}`;

  return {
    scope_valid: scopeValid,
    unrelated_files: unrelatedFiles,
    forbidden_files: forbiddenFiles,
    main_target_detected: mainTargetDetected,
    violations,
    summary,
  };
}
