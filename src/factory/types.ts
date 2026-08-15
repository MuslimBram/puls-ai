/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3A & PHASE 3B ENGINE TYPES
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

export type WorkerClass = "builder" | "engineering_agent";

export type RoutingStrategy =
  | "single_worker"
  | "parallel_compare"
  | "primary_plus_reviewer"
  | "primary_plus_repair"
  | "specialist_pair";

export type WorkerRole =
  | "primary_builder"
  | "secondary_builder"
  | "reviewer"
  | "repair_agent"
  | "inspection_agent";

export type ExecutionMode =
  | "planning"
  | "locally_available"
  | "connection_required"
  | "credit_required"
  | "blocked_by_budget";

export type IsolationStrategy =
  | "git_branch"
  | "git_worktree"
  | "sandbox"
  | "remote_builder_project";

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

// ── PHASE 3B MULTI-BUILDER / AGENT ROUTER TYPES ─────────────────────────────

export interface SelectedWorkerConfig {
  worker_id: WorkerType;
  worker_class: WorkerClass;
  role: WorkerRole;
  priority: number;
  capabilities: string[];
  reason_selected: string;
  execution_mode: ExecutionMode;
  requires_external_call: boolean;
  requires_paid_credit: boolean;
  requires_connection: boolean;
  isolation_strategy: IsolationStrategy;
  context_scope: string;
  adapter_key: string | null;
}

export interface ExecutionPlan {
  execution_id: string;
  task_id: string;
  workspace_id: string;
  repository: string;
  ref: string;
  task_type: TaskType;
  strategy: RoutingStrategy;
  selected_workers: SelectedWorkerConfig[];
  worker_order: string[];
  parallel_groups: string[][];
  context_pack_id: string;
  expected_outputs: string[];
  quality_requirements: string[];
  budget_policy: BudgetCostPolicy;
  estimated_external_calls: number;
  human_approval_required: HumanApprovalRequirements;
  production_allowed: boolean;
  dispatch_allowed: boolean;
  blocked_reason: string | null;
  created_at: string;
}

export interface DispatchResult {
  dispatched: boolean;
  execution_id: string;
  worker_id: WorkerType;
  status: "DISPATCH_NOT_ALLOWED_PHASE_3B" | "BLOCKED_BY_POLICY" | "DISPATCH_STUB";
  reason: string;
  timestamp: string;
}
