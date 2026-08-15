/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3A, 3B, 3C & 3D ENGINE TYPES
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

// ── PHASE 3C QUALITY GATE TYPES ─────────────────────────────────────────────

export interface BuildResultArtifact {
  success: boolean;
  output?: string;
  errors?: string[];
}

export interface TestResultArtifact {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  output?: string;
}

export interface LintResultArtifact {
  errors: number;
  warnings: number;
  output?: string;
}

export interface SecurityResultArtifact {
  secrets_detected: boolean;
  findings?: string[];
}

export interface RuntimeResultArtifact {
  passed: boolean;
  details?: string;
}

export interface BrowserResultArtifact {
  passed: boolean;
  page_title?: string;
  visual_diff_passed?: boolean;
  details?: string;
}

export interface WorkerResult {
  worker_id: WorkerType;
  execution_id: string;
  status: "success" | "failed" | "cancelled" | "timed_out" | "error";
  branch_or_sandbox?: string;
  changed_files?: string[];
  build_result?: BuildResultArtifact;
  test_result?: TestResultArtifact;
  lint_result?: LintResultArtifact;
  security_result?: SecurityResultArtifact;
  runtime_result?: RuntimeResultArtifact;
  browser_result?: BrowserResultArtifact;
  screenshots?: string[];
  logs?: string[];
  warnings?: string[];
  errors?: string[];
  external_calls?: number;
  credits_consumed?: number;
  started_at?: string;
  completed_at?: string;
}

export type GateDecision =
  | "pass"
  | "fail"
  | "needs_repair"
  | "needs_human_review"
  | "insufficient_evidence";

export type CheckType =
  | "build"
  | "tests"
  | "lint"
  | "security"
  | "runtime"
  | "browser"
  | "screenshots"
  | "acceptance_criteria"
  | "forbidden_actions"
  | "external_call_policy"
  | "budget_policy"
  | "isolation_integrity";

export type CheckStatus =
  | "pass"
  | "fail"
  | "warning"
  | "not_applicable"
  | "missing_evidence";

export interface CheckResult {
  check_id: string;
  type: CheckType;
  required: boolean;
  status: CheckStatus;
  score: number;
  evidence: string[];
  reason: string;
  blocking: boolean;
}

export interface ViolationDetail {
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  check_type: CheckType;
  message: string;
  worker_id?: WorkerType;
}

export interface WorkerQualityEvaluation {
  worker_id: WorkerType;
  worker_class: WorkerClass;
  overall_score: number;
  status: GateDecision;
  eligible: boolean;
  checks: CheckResult[];
  violations: ViolationDetail[];
  rank?: number;
}

export interface QualityReport {
  quality_report_id: string;
  execution_id: string;
  task_id: string;
  overall_status: GateDecision;
  overall_score: number;
  gate_decision: GateDecision;
  worker_results: WorkerQualityEvaluation[];
  checks: CheckResult[];
  evidence: Record<string, unknown>;
  violations: ViolationDetail[];
  warnings: string[];
  recommended_action: string;
  eligible_workers: WorkerType[];
  rejected_workers: WorkerType[];
  requires_human_review: boolean;
  created_at: string;
}

// ── PHASE 3D PULSE JUDGE TYPES ───────────────────────────────────────────────

export type JudgeDecisionValue =
  | "select_base"
  | "needs_repair"
  | "needs_human_review"
  | "no_viable_candidate"
  | "insufficient_evidence";

export interface RankedCandidateDetail {
  worker_id: WorkerType;
  worker_class: WorkerClass;
  score: number; // Final deterministic judge score (0-100)
  quality_score: number; // Quality Gate score
  task_fit_score: number;
  rank: number;
  rationale: string;
}

export interface PatchCandidate {
  source_worker: WorkerType;
  target_area: string;
  reason: string;
  expected_benefit: string;
  risk: string;
  requires_review: boolean;
  recommended_action: string;
}

export interface RepairCandidate {
  problem: string;
  source_worker: WorkerType;
  recommended_repair_worker: WorkerType;
  reason: string;
  severity: "critical" | "high" | "medium" | "low";
  required_evidence_after_repair: string[];
}

export interface JudgeDecision {
  judge_decision_id: string;
  execution_id: string;
  task_id: string;
  decision: JudgeDecisionValue;
  selected_base_worker: WorkerType | null;
  ranked_candidates: RankedCandidateDetail[];
  patch_candidates: PatchCandidate[];
  repair_candidates: RepairCandidate[];
  rejected_candidates: WorkerType[];
  selection_reason: string;
  score_breakdown: Record<string, number>;
  confidence: number; // 0.0 to 1.0
  requires_human_review: boolean;
  approval_reasons: string[];
  next_action: string;
  created_at: string;
}
