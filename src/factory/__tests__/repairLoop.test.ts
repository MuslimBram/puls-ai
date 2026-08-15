/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3E: REPAIR LOOP & FACTORY ORCHESTRATION ZERO-COST TEST SUITE
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTaskPlan,
  createContextPack,
  createExecutionPlan,
  evaluateQualityGate,
  evaluatePulseJudge,
  createRepairPlan,
  evaluateRepairLoopState,
  evaluateProgress,
  generateRepairFingerprint,
  runFactoryPipeline,
  SoftwareTaskInput,
  WorkerResult,
  QualityReport,
} from "../index";

describe("Phase 3E: Repair Loop Engine & Factory Orchestration", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on global fetch to guarantee zero HTTP/external calls occur
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("UNAUTHORIZED EXTERNAL HTTP CALL DURING PHASE 3E REPAIR LOOP!");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validBaseInput: SoftwareTaskInput = {
    task_id: "test_task_3e_1001",
    workspace_id: "ws_pulse_dev_3e",
    repository: "MuslimBram/puls-ai",
    ref: "main",
    objective: "Implement billing repair loop pipeline",
    target_environment: "development",
  };

  const failingWorkerResult: WorkerResult = {
    worker_id: "claude_code",
    execution_id: "exec_3e_1001",
    status: "failed",
    branch_or_sandbox: "feature/task-3e-claude",
    changed_files: ["src/services/billing.ts"],
    build_result: { success: false, errors: ["Syntax error at line 42"] },
    test_result: { total: 10, passed: 7, failed: 3, skipped: 0 },
    lint_result: { errors: 1, warnings: 0 },
    security_result: { secrets_detected: false },
    external_calls: 0,
    credits_consumed: 0,
  };

  const cleanWorkerResult: WorkerResult = {
    worker_id: "antigravity_candidate",
    execution_id: "exec_3e_1001",
    status: "success",
    branch_or_sandbox: "worktree/task-3e-antigravity",
    changed_files: ["src/services/billing.ts"],
    build_result: { success: true, output: "Build clean" },
    test_result: { total: 10, passed: 10, failed: 0, skipped: 0 },
    lint_result: { errors: 0, warnings: 0 },
    security_result: { secrets_detected: false },
    runtime_result: { passed: true },
    external_calls: 0,
    credits_consumed: 0,
  };

  describe("1. Deterministic Repair Plan Generation", () => {
    it("should produce deterministic RepairPlan for identical inputs", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failingWorkerResult]);
      const judgeDecision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failingWorkerResult]);

      const rPlan1 = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision);
      const rPlan2 = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision);

      expect(rPlan1.repair_plan_id.substring(0, 10)).toBe(rPlan2.repair_plan_id.substring(0, 10));
      expect(rPlan1.repair_required).toBe(rPlan2.repair_required);
      expect(rPlan1.target_worker).toBe(rPlan2.target_worker);
      expect(rPlan1.problems.length).toBe(rPlan2.problems.length);
    });

    it("no repair required when Judge selects base cleanly (select_base)", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [cleanWorkerResult]);
      const judgeDecision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [cleanWorkerResult]);

      const rPlan = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision);

      expect(rPlan.repair_required).toBe(false);
      expect(rPlan.stop_condition).toBe("not_required");
      expect(rPlan.dispatch_allowed).toBe(false);
    });

    it("needs_repair decision produces structured RepairPlan with problems and context delta", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failingWorkerResult]);
      const judgeDecision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failingWorkerResult]);

      const rPlan = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision);

      expect(rPlan.repair_required).toBe(true);
      expect(rPlan.problems.length).toBeGreaterThan(0);
      expect(rPlan.context_delta.failed_checks.length).toBeGreaterThan(0);
      expect(rPlan.context_delta.affected_files_or_areas).toEqual(plan.likely_files_or_areas);
    });
  });

  describe("2. Worker Selection & No-Spend Gate Protection", () => {
    it("favors Antigravity candidate for local debugging, build, and test repair", () => {
      const debugInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Fix bug crash and build failure in existing repository",
      };

      const plan = createTaskPlan(debugInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failingWorkerResult]);
      const judgeDecision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failingWorkerResult]);

      const rPlan = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision);

      expect(rPlan.target_worker).toBe("antigravity_candidate");
    });

    it("no_spend policy blocks paid repair worker dispatch (dispatch_allowed = false)", () => {
      const plan = createTaskPlan(validBaseInput); // Default policy is ZERO_COST_POLICY (no_spend)
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failingWorkerResult]);

      // Force target worker to claude_code (external paid API)
      const judgeDecision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failingWorkerResult]);
      judgeDecision.repair_candidates = [{
        problem: "Backend failure",
        source_worker: "claude_code",
        recommended_repair_worker: "claude_code",
        reason: "Complex reasoning required",
        severity: "high",
        required_evidence_after_repair: ["Build pass"],
      }];

      const rPlan = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision);

      expect(rPlan.target_worker).toBe("claude_code");
      expect(rPlan.dispatch_allowed).toBe(false);
      expect(rPlan.blocked_reason).toBe("budget_or_connection_required");
    });

    it("Security repair strictly forces human approval (human_approval_required = true)", () => {
      const secInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Security patch for vulnerability",
      };

      const plan = createTaskPlan(secInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failingWorkerResult]);
      const judgeDecision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failingWorkerResult]);

      const rPlan = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision);

      expect(rPlan.human_approval_required).toBe(true);
      expect(rPlan.stop_condition).toBe("human_approval_required");
    });
  });

  describe("3. Anti-Loop Safety & Hard Max Limits", () => {
    it("enforces max attempts limit (default 2, hard max 3)", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failingWorkerResult]);
      const judgeDecision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failingWorkerResult]);

      // Mock previous state at attempt 3
      const mockState = evaluateRepairLoopState(plan, contextPack, execPlan, qReport, judgeDecision);
      mockState.current_attempt = 3;

      const rPlan = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision, mockState);

      expect(rPlan.attempt_number).toBe(4);
      expect(rPlan.dispatch_allowed).toBe(false);
      expect(rPlan.stop_condition).toBe("max_attempts_exceeded");
    });

    it("detects repeated repair fingerprint and prevents duplicate automatic retry", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failingWorkerResult]);
      const judgeDecision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failingWorkerResult]);
      const rPlan1 = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision);
      const fingerprint = generateRepairFingerprint(
        plan.task_id,
        rPlan1.target_worker || "antigravity_candidate",
        rPlan1.problems.map((p) => p.category),
        rPlan1.repair_strategy
      );

      const mockState = evaluateRepairLoopState(plan, contextPack, execPlan, qReport, judgeDecision);
      mockState.history = [{
        attempt: 1,
        plan_id: rPlan1.repair_plan_id,
        target_worker: rPlan1.target_worker || "antigravity_candidate",
        fingerprint,
        quality_report_id: qReport.quality_report_id,
        judge_decision_id: judgeDecision.judge_decision_id,
        problems_count: rPlan1.problems.length,
        blockers_resolved: 0,
        score_delta: 0,
        made_meaningful_progress: false,
        timestamp: new Date().toISOString(),
      }];

      const rPlan2 = createRepairPlan(plan, contextPack, execPlan, qReport, judgeDecision, mockState);

      expect(rPlan2.blocked_reason).toBe("repeated_failed_repair");
      expect(rPlan2.human_approval_required).toBe(true);
    });
  });

  describe("4. Progress Evaluation & Metric Detection", () => {
    it("detects meaningful progress when blockers are resolved", () => {
      const prevReport: QualityReport = {
        quality_report_id: "qr_1",
        execution_id: "exec_1",
        task_id: "task_1",
        overall_status: "fail",
        overall_score: 40,
        gate_decision: "fail",
        worker_results: [],
        checks: [{ check_id: "c1", type: "build", required: true, status: "fail", score: 0, evidence: [], reason: "fail", blocking: true }],
        evidence: {},
        violations: [{ code: "BUILD_FAIL", severity: "critical", check_type: "build", message: "Build failed" }],
        warnings: [],
        recommended_action: "Fix build",
        eligible_workers: [],
        rejected_workers: ["claude_code"],
        requires_human_review: false,
        created_at: new Date().toISOString(),
      };

      const newReport: QualityReport = {
        ...prevReport,
        quality_report_id: "qr_2",
        overall_status: "pass",
        overall_score: 85,
        checks: [{ check_id: "c1", type: "build", required: true, status: "pass", score: 100, evidence: [], reason: "pass", blocking: false }],
        violations: [],
      };

      const progress = evaluateProgress(prevReport, newReport);

      expect(progress.meaningful_progress).toBe(true);
      expect(progress.blockers_resolved).toBe(1);
    });

    it("higher numeric score alone without resolved blockers does NOT count as meaningful progress", () => {
      const prevReport: QualityReport = {
        quality_report_id: "qr_1",
        execution_id: "exec_1",
        task_id: "task_1",
        overall_status: "fail",
        overall_score: 40,
        gate_decision: "fail",
        worker_results: [],
        checks: [],
        evidence: {},
        violations: [
          { code: "BUILD_FAIL", severity: "critical", check_type: "build", message: "Build failed" },
          { code: "TEST_FAIL", severity: "high", check_type: "tests", message: "Tests failed" },
        ],
        warnings: [],
        recommended_action: "Fix",
        eligible_workers: [],
        rejected_workers: [],
        requires_human_review: false,
        created_at: new Date().toISOString(),
      };

      const newReport: QualityReport = {
        ...prevReport,
        quality_report_id: "qr_2",
        overall_score: 55, // Score went up, but violations remained identical
        violations: [
          { code: "BUILD_FAIL", severity: "critical", check_type: "build", message: "Build failed" },
          { code: "TEST_FAIL", severity: "high", check_type: "tests", message: "Tests failed" },
        ],
      };

      const progress = evaluateProgress(prevReport, newReport);

      expect(progress.meaningful_progress).toBe(false);
      expect(progress.blockers_resolved).toBe(0);
    });
  });

  describe("5. Factory Orchestration Contract Pipeline", () => {
    it("runs complete Factory Pipeline in non-executing contract mode", () => {
      const result = runFactoryPipeline(validBaseInput, [cleanWorkerResult]);

      expect(result.factory_execution_id).toBeDefined();
      expect(result.task_plan).toBeDefined();
      expect(result.context_pack).toBeDefined();
      expect(result.execution_plan).toBeDefined();
      expect(result.quality_report).toBeDefined();
      expect(result.judge_decision).toBeDefined();
      expect(result.repair_loop_state).toBeDefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
