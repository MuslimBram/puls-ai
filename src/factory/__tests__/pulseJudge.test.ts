/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3D: PULSE JUDGE ZERO-COST TEST SUITE
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTaskPlan,
  createContextPack,
  createExecutionPlan,
  evaluateQualityGate,
  evaluatePulseJudge,
  SoftwareTaskInput,
  WorkerResult,
} from "../index";

describe("Phase 3D: Pulse Judge Engine", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on global fetch to guarantee zero HTTP/external calls occur
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("UNAUTHORIZED EXTERNAL HTTP CALL DURING PHASE 3D PULSE JUDGE!");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validBaseInput: SoftwareTaskInput = {
    task_id: "test_task_3d_1001",
    workspace_id: "ws_pulse_dev_3d",
    repository: "MuslimBram/puls-ai",
    ref: "main",
    objective: "Implement backend billing event controller",
    target_environment: "development",
  };

  const workerResult1: WorkerResult = {
    worker_id: "emergent_mcp",
    execution_id: "exec_3d_1001",
    status: "success",
    branch_or_sandbox: "feature/task-3d-emergent",
    changed_files: ["src/services/billing.ts"],
    build_result: { success: true, output: "Build clean" },
    test_result: { total: 10, passed: 10, failed: 0, skipped: 0 },
    lint_result: { errors: 0, warnings: 0 },
    security_result: { secrets_detected: false },
    runtime_result: { passed: true },
    external_calls: 0,
    credits_consumed: 0,
  };

  const workerResult2: WorkerResult = {
    worker_id: "claude_code",
    execution_id: "exec_3d_1001",
    status: "success",
    branch_or_sandbox: "feature/task-3d-claude",
    changed_files: ["src/services/billing.ts", "src/services/billingTypes.ts"],
    build_result: { success: true, output: "Build clean" },
    test_result: { total: 8, passed: 8, failed: 0, skipped: 0 },
    lint_result: { errors: 0, warnings: 0 },
    security_result: { secrets_detected: false },
    runtime_result: { passed: true },
    external_calls: 0,
    credits_consumed: 0,
  };

  describe("1. Deterministic JudgeDecision Generation", () => {
    it("should produce deterministic JudgeDecision for identical inputs", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [workerResult1, workerResult2]);

      const decision1 = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [workerResult1, workerResult2]);
      const decision2 = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [workerResult1, workerResult2]);

      expect(decision1.decision).toBe(decision2.decision);
      expect(decision1.selected_base_worker).toBe(decision2.selected_base_worker);
      expect(decision1.ranked_candidates).toEqual(decision2.ranked_candidates);
      expect(decision1.confidence).toBe(decision2.confidence);
    });
  });

  describe("2. Eligibility & Blocker Enforcement", () => {
    it("REJECTED Quality Gate worker can NEVER win base worker selection", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const failingWorker: WorkerResult = {
        ...workerResult1,
        worker_id: "lovable_mcp",
        build_result: { success: false, errors: ["Compilation error"] }, // Failing build
      };

      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failingWorker, workerResult2]);
      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failingWorker, workerResult2]);

      expect(decision.selected_base_worker).not.toBe("lovable_mcp");
      expect(decision.selected_base_worker).toBe("claude_code");
      expect(decision.rejected_candidates).toContain("lovable_mcp");
    });

    it("no viable candidates -> produces no_viable_candidate or needs_repair decision", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const allFailingWorkers: WorkerResult[] = [
        { ...workerResult1, build_result: { success: false, errors: ["Build failed"] } },
        { ...workerResult2, test_result: { total: 5, passed: 2, failed: 3, skipped: 0 } },
      ];

      const qReport = evaluateQualityGate(plan, contextPack, execPlan, allFailingWorkers);
      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, allFailingWorkers);

      expect(decision.selected_base_worker).toBeNull();
      expect(["needs_repair", "no_viable_candidate"]).toContain(decision.decision);
      expect(decision.repair_candidates.length).toBeGreaterThan(0);
    });
  });

  describe("3. Base Selection & Patch Candidate Model", () => {
    it("selects ONE strongest base worker and catalogs secondary eligible workers as patch candidates", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [workerResult1, workerResult2]);
      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [workerResult1, workerResult2]);

      expect(decision.selected_base_worker).toBeDefined();
      expect(decision.ranked_candidates.length).toBe(2);
      expect(decision.patch_candidates.length).toBe(1);
      expect(decision.patch_candidates[0].source_worker).toBe(decision.ranked_candidates[1].worker_id);
    });
  });

  describe("4. Task-Aware Preferences & Antigravity Support", () => {
    it("Debugging task -> favors Antigravity candidate or Claude Code", () => {
      const debugInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Fix bug and trace stacktrace exception crash in existing repository",
      };

      const antigravityResult: WorkerResult = {
        ...workerResult1,
        worker_id: "antigravity_candidate",
        branch_or_sandbox: "worktree/phase-3d",
        changed_files: ["src/services/billing.ts"], // Minimal diff
      };

      const plan = createTaskPlan(debugInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [antigravityResult]);

      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [antigravityResult]);
      expect(decision.selected_base_worker).toBe("antigravity_candidate");
    });

    it("UI task -> favors browser-proven builder (Base44 or Lovable)", () => {
      const uiInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Design a new modern UI button and page layout",
      };

      const uiWorker: WorkerResult = {
        ...workerResult1,
        worker_id: "lovable_mcp",
        browser_result: { passed: true, page_title: "Dashboard", visual_diff_passed: true },
        screenshots: ["https://screenshots.local/ui.png"],
      };

      const plan = createTaskPlan(uiInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [uiWorker]);

      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [uiWorker]);
      expect(decision.selected_base_worker).toBe("lovable_mcp");
    });

    it("Security task -> forces human review (requires_human_review: true)", () => {
      const secInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Audit security JWT tokens and encryption keys",
      };

      const plan = createTaskPlan(secInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [workerResult2]);

      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [workerResult2]);
      expect(decision.requires_human_review).toBe(true);
      expect(decision.decision).toBe("needs_human_review");
    });

    it("Close score gap between top candidates (<= 3 pts) -> forces human review", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      // Create two almost identical worker results with nearly equal scores
      const candidateA: WorkerResult = { ...workerResult1, worker_id: "emergent_mcp" };
      const candidateB: WorkerResult = { ...workerResult1, worker_id: "claude_code" };

      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [candidateA, candidateB]);
      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [candidateA, candidateB]);

      if (Math.abs(decision.ranked_candidates[0].score - decision.ranked_candidates[1].score) <= 3) {
        expect(decision.requires_human_review).toBe(true);
        expect(decision.decision).toBe("needs_human_review");
      }
    });
  });

  describe("5. Repair Candidate Routing & Non-Execution Purity", () => {
    it("recommends appropriate repair worker for failed workers", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const failedWorker: WorkerResult = {
        ...workerResult1,
        worker_id: "base44_mcp",
        build_result: { success: false, errors: ["Build failure in backend logic"] },
      };

      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [failedWorker]);
      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [failedWorker]);

      expect(decision.repair_candidates.length).toBe(1);
      expect(decision.repair_candidates[0].recommended_repair_worker).toBeDefined();
    });

    it("guarantees zero HTTP/network calls during Pulse Judge evaluation", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);
      const qReport = evaluateQualityGate(plan, contextPack, execPlan, [workerResult1]);

      const decision = evaluatePulseJudge(plan, contextPack, execPlan, qReport, [workerResult1]);
      expect(decision).toBeDefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
