/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3C: QUALITY GATE ZERO-COST TEST SUITE
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTaskPlan,
  createContextPack,
  createExecutionPlan,
  evaluateQualityGate,
  scanArtifactsForSecrets,
  evaluateScopeCompliance,
  SoftwareTaskInput,
  WorkerResult,
} from "../index";

describe("Phase 3C: Pure Quality Gate Engine", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on global fetch to guarantee zero HTTP/external calls occur
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("UNAUTHORIZED EXTERNAL HTTP CALL DURING PHASE 3C QUALITY GATE!");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validBaseInput: SoftwareTaskInput = {
    task_id: "test_task_3c_1001",
    workspace_id: "ws_pulse_dev_3c",
    repository: "MuslimBram/puls-ai",
    ref: "main",
    objective: "Implement backend billing webhook listener",
    target_environment: "development",
  };

  const validWorkerResult: WorkerResult = {
    worker_id: "claude_code",
    execution_id: "exec_3c_1001",
    status: "success",
    branch_or_sandbox: "feature/task-3c",
    changed_files: ["src/services/billingWebhook.ts"],
    build_result: { success: true, output: "Build successful" },
    test_result: { total: 5, passed: 5, failed: 0, skipped: 0, output: "5 tests passed" },
    lint_result: { errors: 0, warnings: 0, output: "0 lint errors" },
    security_result: { secrets_detected: false, findings: [] },
    runtime_result: { passed: true, details: "Runtime healthy" },
    external_calls: 0,
    credits_consumed: 0,
    logs: ["Log: webhook listener built cleanly."],
  };

  describe("1. Deterministic QualityReport Generation", () => {
    it("should produce deterministic QualityReport for identical worker results", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const report1 = evaluateQualityGate(plan, contextPack, execPlan, [validWorkerResult]);
      const report2 = evaluateQualityGate(plan, contextPack, execPlan, [validWorkerResult]);

      expect(report1.overall_status).toBe(report2.overall_status);
      expect(report1.overall_score).toBe(report2.overall_score);
      expect(report1.eligible_workers).toEqual(report2.eligible_workers);
      expect(report1.rejected_workers).toEqual(report2.rejected_workers);
    });
  });

  describe("2. Fail-Closed Rules & Blocker Enforcement", () => {
    it("missing mandatory build evidence -> results in insufficient_evidence or fail", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const resultNoBuild: WorkerResult = {
        ...validWorkerResult,
        build_result: undefined, // Missing build result
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [resultNoBuild]);
      expect(["insufficient_evidence", "fail"]).toContain(report.overall_status);
      expect(report.rejected_workers).toContain("claude_code");
    });

    it("failed tests -> blocking failure (fail)", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const resultFailingTests: WorkerResult = {
        ...validWorkerResult,
        test_result: { total: 5, passed: 3, failed: 2, skipped: 0, output: "2 tests failed" },
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [resultFailingTests]);
      expect(report.overall_status).toBe("fail");
      expect(report.rejected_workers).toContain("claude_code");
    });

    it("HIGH SCORE CANNOT OVERRIDE A BLOCKING FAILURE (score 95 + secret leak => fail)", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const secretLeakingWorker: WorkerResult = {
        ...validWorkerResult,
        logs: ["Log: using API key sk_live_1234567890abcdef1234 for testing"],
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [secretLeakingWorker]);
      expect(report.overall_status).toBe("fail");
      expect(report.rejected_workers).toContain("claude_code");
    });

    it("no_spend policy + external calls > 0 -> fail", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const externalCallingWorker: WorkerResult = {
        ...validWorkerResult,
        external_calls: 3,
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [externalCallingWorker]);
      expect(report.overall_status).toBe("fail");
      expect(report.rejected_workers).toContain("claude_code");
    });

    it("no_spend policy + credits > 0 -> fail", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const creditConsumingWorker: WorkerResult = {
        ...validWorkerResult,
        credits_consumed: 15,
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [creditConsumingWorker]);
      expect(report.overall_status).toBe("fail");
      expect(report.rejected_workers).toContain("claude_code");
    });

    it("worker targeted main branch directly -> scope violation and fail", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const mainBranchTargetWorker: WorkerResult = {
        ...validWorkerResult,
        branch_or_sandbox: "main",
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [mainBranchTargetWorker]);
      expect(report.overall_status).toBe("fail");
      expect(report.rejected_workers).toContain("claude_code");
    });
  });

  describe("3. Secret Scanner Contract (Fake Fixtures Only)", () => {
    it("should detect fake secret patterns in logs and outputs", () => {
      const logs = ["Log containing sk_test_abcdef123456789012"];
      const scan = scanArtifactsForSecrets(logs, [], []);

      expect(scan.secrets_detected).toBe(true);
      expect(scan.findings.length).toBeGreaterThan(0);
      expect(scan.findings[0].pattern_name).toContain("Generic API Key");
    });

    it("should detect fake dotenv leakage in changed files", () => {
      const changedFiles = [".env.production"];
      const scan = scanArtifactsForSecrets([], changedFiles, []);

      expect(scan.secrets_detected).toBe(true);
      expect(scan.findings[0].pattern_name).toBe("Forbidden Secret File Changed");
    });
  });

  describe("4. Task-Aware Rules & UI/Backend Differences", () => {
    it("UI task requires browser / screenshot evidence", () => {
      const uiInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Design a new modern UI button and modal page",
      };
      const plan = createTaskPlan(uiInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const workerNoBrowser: WorkerResult = {
        ...validWorkerResult,
        worker_id: "frontend_builder_candidate",
        browser_result: undefined,
        screenshots: [],
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [workerNoBrowser]);
      expect(report.rejected_workers).toContain("frontend_builder_candidate");
    });

    it("Backend task does NOT require screenshot evidence by default", () => {
      const backendInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Implement backend API route controller",
      };
      const plan = createTaskPlan(backendInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const workerNoBrowser: WorkerResult = {
        ...validWorkerResult,
        worker_id: "emergent_mcp",
        browser_result: undefined,
        screenshots: [],
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [workerNoBrowser]);
      expect(report.eligible_workers).toContain("emergent_mcp");
    });

    it("Security task requires human review (requires_human_review: true)", () => {
      const secInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Audit security JWT tokens and encryption keys",
      };
      const plan = createTaskPlan(secInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const report = evaluateQualityGate(plan, contextPack, execPlan, [validWorkerResult]);
      expect(report.requires_human_review).toBe(true);
      expect(report.overall_status).toBe("needs_human_review");
    });
  });

  describe("5. Multi-Worker Comparison & Antigravity Evidence", () => {
    it("ranks multi-worker results by score but DOES NOT select a final winner", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const worker1: WorkerResult = { ...validWorkerResult, worker_id: "emergent_mcp" };
      const worker2: WorkerResult = {
        ...validWorkerResult,
        worker_id: "claude_code",
        test_result: { total: 5, passed: 4, failed: 1, skipped: 0 }, // Lower score
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [worker1, worker2]);

      expect(report.worker_results.length).toBe(2);
      expect(report.worker_results[0].rank).toBe(1);
      expect(report.worker_results[1].rank).toBe(2);
      expect(report.eligible_workers).toContain("emergent_mcp");
      expect(report.rejected_workers).toContain("claude_code");
      // Quality Gate does not declare a single winner property (leaves winner picking to Phase 3D Pulse Judge)
      expect((report as unknown as Record<string, unknown>).winner).toBeUndefined();
    });

    it("accepts Antigravity engineering agent evidence correctly", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const antigravityResult: WorkerResult = {
        ...validWorkerResult,
        worker_id: "antigravity_candidate",
        branch_or_sandbox: "worktree/phase-3c",
      };

      const report = evaluateQualityGate(plan, contextPack, execPlan, [antigravityResult]);
      expect(report.eligible_workers).toContain("antigravity_candidate");
    });
  });

  describe("6. Purity & Non-Execution Assurance", () => {
    it("should guarantee zero HTTP/network calls during Quality Gate evaluation", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const report = evaluateQualityGate(plan, contextPack, execPlan, [validWorkerResult]);
      expect(report).toBeDefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
