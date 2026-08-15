/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3A: CONTEXT PACK GENERATOR
 *
 * Generates a standardized, lean Context Pack from Task Planner output.
 * Excludes unnecessary codebase noise and includes strictly what candidate workers require:
 * - Task specifications & acceptance criteria
 * - Relevant architecture rules
 * - Selected repository & file contexts
 * - Known interface contracts
 * - Security & no-spend policies
 * - Prohibited actions
 */

import { TaskPlannerOutput, ContextPack } from "./types";

export function createContextPack(plan: TaskPlannerOutput): ContextPack {
  const architectureRules = [
    "Pulse AI operates on React Vite (frontend) + Supabase Edge Functions & PostgreSQL (backend).",
    "Phase 2B Builder Adapter Layer is CLOSED and must remain untouched.",
    "Phase 3A operates strictly in PLANNING ONLY mode. No builder dispatches or external provider calls allowed.",
    "All Edge Functions verify JWT and enforce workspace RLS isolation.",
  ];

  const constraints = [
    "Zero-cost budget policy enforced (0 credits / 0 USD spend).",
    "Max worker candidate cap: 2–3 workers.",
    "Do not push to main or deploy to production without explicit human approval.",
    "Isolated git branch development strictly required.",
  ];

  const knownInterfacesContracts = [
    "TaskPlannerOutput: { task_id, workspace_id, repository, task_type, normalized_objective, acceptance_criteria, ... }",
    "ContextPack: { task_id, task_specification, acceptance_criteria, selected_repository_context, ... }",
    "BuilderResult: { success: boolean, adapter_key: string, logs: string[], artifacts: string[] } (Phase 2B contract)",
  ];

  const securityRules = [
    "Require workspace authorization on all requests.",
    "Do not expose API keys or secrets in code or context logs.",
    "Fail closed on ambiguous destructive commands or unauthorized production access.",
  ];

  const noSpendRules = [
    "Do not call external paid API endpoints.",
    "Do not consume builder build credits.",
    "Do not reconnect external automated build syncs.",
  ];

  return {
    task_id: plan.task_id,
    task_specification: {
      task_type: plan.task_type,
      normalized_objective: plan.normalized_objective,
      complexity: plan.complexity,
      risk_level: plan.risk_level,
    },
    acceptance_criteria: plan.acceptance_criteria,
    architecture_rules: architectureRules,
    selected_repository_context: {
      repository_ref: plan.repository,
      targeted_files_or_areas: plan.likely_files_or_areas,
      full_repo_included: false, // Lean context pack excludes full repository dump
    },
    constraints,
    known_interfaces_contracts: knownInterfacesContracts,
    test_requirements: plan.tests_required,
    security_rules: securityRules,
    no_spend_rules: noSpendRules,
    prohibited_actions: plan.forbidden_actions,
  };
}
