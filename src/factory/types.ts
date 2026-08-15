/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3A: TASK PLANNER + CONTEXT PACK TYPES
 */

export type TaskType =
  | "ui"
  | "backend"
  | "debugging"
  | "refactor"
  | "integration"
  | "security"
  | "database"
  | "full_prototype";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type EstimatedComplexity = "XS" | "S" | "M" | "L" | "XL";

export type WorkerType =
  | "lovable_mcp"
  | "emergent_mcp"
  | "base44_mcp"
  | "replit_mcp"
  | "claude_code"
  | "antigravity_candidate";

export interface BudgetCostPolicy {
  allow_spend: boolean;
  max_credits: number;
  currency: string;
  policy_name: "ZERO_COST_POLICY" | "PAID_APPROVED_POLICY";
}

export interface HumanApprovalRequirements {
  required: boolean;
  reasons: string[];
}

export interface SoftwareTaskInput {
  task_id?: string;
  workspace_id?: string;
  repository?: string;
  ref?: string;
  objective: string;
  task_type?: string;
  target_environment?: "development" | "staging" | "production";
  requested_budget?: {
    allow_spend?: boolean;
    max_credits?: number;
  };
  human_approved?: boolean;
}

export interface TaskPlannerOutput {
  task_id: string;
  workspace_id: string;
  repository: string; // formatted as repository/ref
  ref: string;
  task_type: TaskType;
  normalized_objective: string;
  acceptance_criteria: string[];
  required_capabilities: string[];
  risk_level: RiskLevel;
  complexity: EstimatedComplexity;
  recommended_workers: WorkerType[];
  worker_count: number;
  likely_files_or_areas: string[];
  tests_required: string[];
  forbidden_actions: string[];
  budget_policy: BudgetCostPolicy;
  human_approval_required: HumanApprovalRequirements;
}

export interface ContextPack {
  task_id: string;
  task_specification: {
    task_type: TaskType;
    normalized_objective: string;
    complexity: EstimatedComplexity;
    risk_level: RiskLevel;
  };
  acceptance_criteria: string[];
  architecture_rules: string[];
  selected_repository_context: {
    repository_ref: string;
    targeted_files_or_areas: string[];
    full_repo_included: boolean;
  };
  constraints: string[];
  known_interfaces_contracts: string[];
  test_requirements: string[];
  security_rules: string[];
  no_spend_rules: string[];
  prohibited_actions: string[];
}

export interface SafetyValidationResult {
  passed: boolean;
  reason?: string;
  code?: string;
}
