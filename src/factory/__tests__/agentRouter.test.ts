/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3B: MULTI-BUILDER / AGENT ROUTER ZERO-COST TEST SUITE
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTaskPlan,
  createContextPack,
  createExecutionPlan,
  getPhase2BAdapterKey,
  getWorkerClass,
  isExternalCallRequired,
  defaultDispatcher,
  TaskPlannerSafetyError,
  SoftwareTaskInput,
  WorkerType,
} from "../index";

describe("Phase 3B: Multi-Builder / Agent Router Engine", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on global fetch to guarantee zero HTTP/external calls occur
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("UNAUTHORIZED EXTERNAL HTTP CALL DURING PHASE 3B ROUTING!");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validBaseInput: SoftwareTaskInput = {
    task_id: "test_task_3b_1001",
    workspace_id: "ws_pulse_dev_3b",
    repository: "MuslimBram/puls-ai",
    ref: "main",
    objective: "Implement backend billing event processing endpoint",
    target_environment: "development",
  };

  describe("1. Canonical Worker & Phase 2B Bridge Classification", () => {
    it("should correctly classify builders vs engineering agents", () => {
      expect(getWorkerClass("frontend_builder_candidate")).toBe("builder");
      expect(getWorkerClass("emergent_mcp")).toBe("builder");
      expect(getWorkerClass("base44_mcp")).toBe("builder");
      expect(getWorkerClass("replit_mcp")).toBe("builder");

      expect(getWorkerClass("claude_code")).toBe("engineering_agent");
      expect(getWorkerClass("antigravity_candidate")).toBe("engineering_agent");
    });

    it("should accurately map Phase 2B adapter keys and preserve local candidates", () => {
      // Frontend builder is retained as a planning candidate, not as a live external adapter.
      expect(getPhase2BAdapterKey("frontend_builder_candidate")).toBeNull();
      expect(getPhase2BAdapterKey("emergent_mcp")).toBe("emergent_mcp");
      expect(getPhase2BAdapterKey("base44_mcp")).toBe("base44_mcp");
      expect(getPhase2BAdapterKey("replit_mcp")).toBe("replit_mcp");
      expect(getPhase2BAdapterKey("claude_code")).toBe("claude_code");

      // Antigravity does not pretend to have a Phase 2B adapter
      expect(getPhase2BAdapterKey("antigravity_candidate")).toBeNull();
    });

    it("should mark local candidates as not requiring external HTTP calls", () => {
      expect(isExternalCallRequired("frontend_builder_candidate")).toBe(false);
      expect(isExternalCallRequired("claude_code")).toBe(true);
      expect(isExternalCallRequired("antigravity_candidate")).toBe(false);
    });
  });

  describe("2. Deterministic ExecutionPlan & Strategy Generation", () => {
    it("should generate identical ExecutionPlans for identical TaskPlan + ContextPack", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);

      const execPlan1 = createExecutionPlan(plan, contextPack);
      const execPlan2 = createExecutionPlan(plan, contextPack);

      expect(execPlan1.strategy).toBe(execPlan2.strategy);
      expect(execPlan1.selected_workers).toEqual(execPlan2.selected_workers);
      expect(execPlan1.worker_order).toEqual(execPlan2.worker_order);
      expect(execPlan1.parallel_groups).toEqual(execPlan2.parallel_groups);
      expect(execPlan1.dispatch_allowed).toBe(execPlan2.dispatch_allowed);
    });

    it("should respect max worker limit (<= 3 candidate workers, never all 6 workers)", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      expect(execPlan.selected_workers.length).toBeGreaterThanOrEqual(1);
      expect(execPlan.selected_workers.length).toBeLessThanOrEqual(3);
      expect(execPlan.selected_workers.length).toBeLessThan(6);
    });

    it("should enforce isolation strategies and NEVER target main branch directly", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      for (const worker of execPlan.selected_workers) {
        expect(worker.isolation_strategy).not.toBe("main");
        expect(["git_branch", "git_worktree", "sandbox", "remote_builder_project"]).toContain(
          worker.isolation_strategy
        );
      }
    });
  });

  describe("3. Scenario-Specific Routing Tests", () => {
    it("UI task -> recommends suitable builder pair (Base44 + Frontend Builder)", () => {
      const uiInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Design a new modern UI dashboard layout with React buttons and modal",
      };
      const plan = createTaskPlan(uiInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const workerIds = execPlan.selected_workers.map((w) => w.worker_id);
      expect(workerIds).toContain("base44_mcp");
      expect(workerIds).toContain("frontend_builder_candidate");
      expect(execPlan.strategy).toBe("parallel_compare");
    });

    it("Backend complex task -> recommends Emergent + Claude Code", () => {
      const backendInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Create complex API backend controller service and edge function handler",
      };
      const plan = createTaskPlan(backendInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const workerIds = execPlan.selected_workers.map((w) => w.worker_id);
      expect(workerIds).toContain("emergent_mcp");
      expect(workerIds).toContain("claude_code");
      expect(execPlan.strategy).toBe("primary_plus_reviewer");
    });

    it("Debugging existing repo -> includes Antigravity candidate + Claude Code / Replit", () => {
      const debugInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Fix bug and trace exception crash error in existing repository",
      };
      const plan = createTaskPlan(debugInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const workerIds = execPlan.selected_workers.map((w) => w.worker_id);
      expect(workerIds).toContain("antigravity_candidate");
      expect(workerIds).toContain("claude_code");
    });

    it("Security task -> engineering agent heavy selection (Claude Code + Antigravity candidate)", () => {
      const securityInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Audit security JWT tokens, RLS policies, and encryption vault",
      };
      const plan = createTaskPlan(securityInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const workerIds = execPlan.selected_workers.map((w) => w.worker_id);
      expect(workerIds).toContain("claude_code");
      expect(workerIds).toContain("antigravity_candidate");
    });

    it("Full prototype -> max 3 builders (Frontend Builder + Emergent + Replit)", () => {
      const prototypeInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Build full prototype complete app system end-to-end",
      };
      const plan = createTaskPlan(prototypeInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const workerIds = execPlan.selected_workers.map((w) => w.worker_id);
      expect(workerIds).toContain("frontend_builder_candidate");
      expect(workerIds).toContain("emergent_mcp");
      expect(workerIds).toContain("replit_mcp");
      expect(execPlan.selected_workers.length).toBe(3);
    });
  });

  describe("4. No-Spend Gate & Safety Protection", () => {
    it("should block dispatch when budget policy is no-spend and workers require external calls", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      expect(execPlan.budget_policy.allow_spend).toBe(false);
      expect(execPlan.dispatch_allowed).toBe(false);
      expect(execPlan.blocked_reason).toContain("NO_SPEND_POLICY_ACTIVE");
    });

    it("should fail closed on missing workspace or missing repository during plan creation", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);

      const invalidPlan1 = { ...plan, workspace_id: "" };
      expect(() => createExecutionPlan(invalidPlan1, contextPack)).toThrow(TaskPlannerSafetyError);

      const invalidPlan2 = { ...plan, repository: "" };
      expect(() => createExecutionPlan(invalidPlan2, contextPack)).toThrow(TaskPlannerSafetyError);
    });

    it("should fail closed when production modification requires human approval", () => {
      const prodInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Deploy to production environment",
        target_environment: "production",
        human_approved: false,
      };

      expect(() => createTaskPlan(prodInput)).toThrow(TaskPlannerSafetyError);
    });
  });

  describe("5. Non-Executing Broker Dispatcher Stub Assurance", () => {
    it("should return non-executing dispatch result without making MCP or HTTP calls", async () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);
      const execPlan = createExecutionPlan(plan, contextPack);

      const worker = execPlan.selected_workers[0];
      const result = await defaultDispatcher.dispatchExecution(execPlan, worker);

      expect(result.dispatched).toBe(false);
      expect(result.status).toBe("DISPATCH_NOT_ALLOWED_PHASE_3B");
      expect(result.reason).toContain("Phase 3B is PLANNING ONLY");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
