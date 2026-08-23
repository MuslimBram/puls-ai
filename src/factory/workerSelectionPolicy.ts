/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3A: WORKER SELECTION POLICY (PLANNING ONLY)
 *
 * Deterministic candidate worker recommendation based on task type, complexity, and risk.
 * Enforces a strict max cap of 2–3 workers per task (never all workers).
 * DOES NOT dispatch or invoke any external worker/provider.
 */

import { TaskType, WorkerType, EstimatedComplexity, RiskLevel } from "./types";

export const MAX_RECOMMENDED_WORKERS = 3;
export const DEFAULT_MAX_WORKERS = 2;

export interface WorkerSelectionResult {
  recommended_workers: WorkerType[];
  worker_count: number;
  rationale: string;
}

/**
 * Recommends 2-3 candidate workers deterministically based on task type, complexity, and risk level.
 */
export function recommendWorkers(
  taskType: TaskType,
  complexity: EstimatedComplexity = "M",
  riskLevel: RiskLevel = "medium"
): WorkerSelectionResult {
  let workers: WorkerType[] = [];
  let rationale = "";

  switch (taskType) {
    case "ui":
      workers = ["base44_mcp", "frontend_builder_candidate"];
      rationale = "UI tasks prioritize Base44 layout generation and Frontend Builder frontend components.";
      break;

    case "backend":
      workers = ["emergent_mcp", "claude_code"];
      rationale = "Backend and complex logic tasks recommend Emergent execution engine and Claude Code.";
      break;

    case "debugging":
      workers = ["claude_code", "replit_mcp", "antigravity_candidate"];
      rationale = "Repo debugging tasks utilize Claude Code, Replit workspace, and Antigravity candidate capability.";
      break;

    case "full_prototype":
      workers = ["frontend_builder_candidate", "emergent_mcp", "replit_mcp"];
      rationale = "Full prototypes leverage Frontend Builder UI, Emergent backend logic, and Replit sandbox.";
      break;

    case "refactor":
      workers = ["claude_code", "replit_mcp"];
      rationale = "Refactoring tasks recommend Claude Code code analysis and Replit workspace environment.";
      break;

    case "integration":
      workers = ["emergent_mcp", "claude_code"];
      rationale = "Integration tasks recommend Emergent API orchestration and Claude Code adapter wiring.";
      break;

    case "security":
      workers = ["claude_code", "antigravity_candidate"];
      rationale = "Security hardening and audits utilize Claude Code static analysis and Antigravity candidate code inspection.";
      break;

    case "database":
      workers = ["claude_code", "emergent_mcp"];
      rationale = "Database migration and schema tasks leverage Claude Code SQL generation and Emergent execution.";
      break;

    default:
      workers = ["claude_code", "replit_mcp"];
      rationale = "Default fallback recommends Claude Code and Replit candidate workers.";
      break;
  }

  // If complexity is XL or risk is critical, we cap at MAX_RECOMMENDED_WORKERS (3),
  // otherwise default max 2 workers if applicable.
  const maxLimit = complexity === "XL" || riskLevel === "critical" || taskType === "debugging" || taskType === "full_prototype"
    ? MAX_RECOMMENDED_WORKERS
    : DEFAULT_MAX_WORKERS;

  const finalWorkers = workers.slice(0, maxLimit);

  return {
    recommended_workers: finalWorkers,
    worker_count: finalWorkers.length,
    rationale,
  };
}
