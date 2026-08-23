/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3A: TASK PLANNER & CONTEXT PACK ZERO-COST TEST SUITE
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTaskPlan,
  classifyTaskType,
  createContextPack,
  recommendWorkers,
  validateTaskSafety,
  TaskPlannerSafetyError,
  SoftwareTaskInput,
  TaskType,
  SUPPORTED_TASK_TYPES,
} from "../index";

describe("Phase 3A: Task Planner & Context Pack Engine", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on global fetch to prove zero HTTP/external calls occur
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("UNAUTHORIZED EXTERNAL HTTP CALL DURING PHASE 3A PLANNING!");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validBaseInput: SoftwareTaskInput = {
    task_id: "test_task_1001",
    workspace_id: "ws_pulse_dev_123",
    repository: "MuslimBram/puls-ai",
    ref: "main",
    objective: "Add new analytics dashboard component",
    target_environment: "development",
  };

  describe("1. Deterministic Task Classification", () => {
    it("should deterministically classify all minimum required task types", () => {
      const typeMappings: Record<string, TaskType> = {
        "Build a new React UI page and button": "ui",
        "Create a backend REST API endpoint": "backend",
        "Fix a bug and resolve crash error": "debugging",
        "Refactor clean up code structure": "refactor",
        "Integrate external OAuth webhook provider": "integration",
        "Audit JWT token security and RLS policies": "security",
        "Create database migration SQL table": "database",
        "Build full prototype complete app system": "full_prototype",
      };

      for (const [objective, expectedType] of Object.entries(typeMappings)) {
        const classified = classifyTaskType(objective);
        expect(classified).toBe(expectedType);
      }
    });

    it("should produce deterministic planner output for identical inputs", () => {
      const plan1 = createTaskPlan(validBaseInput);
      const plan2 = createTaskPlan(validBaseInput);

      expect(plan1.task_type).toBe(plan2.task_type);
      expect(plan1.normalized_objective).toBe(plan2.normalized_objective);
      expect(plan1.recommended_workers).toEqual(plan2.recommended_workers);
      expect(plan1.worker_count).toBe(plan2.worker_count);
      expect(plan1.budget_policy).toEqual(plan2.budget_policy);
    });
  });

  describe("2. Standardized Lean Context Pack", () => {
    it("should generate context pack excluding full repository noise", () => {
      const plan = createTaskPlan(validBaseInput);
      const contextPack = createContextPack(plan);

      expect(contextPack.task_id).toBe(plan.task_id);
      expect(contextPack.selected_repository_context.full_repo_included).toBe(false);
      expect(contextPack.selected_repository_context.targeted_files_or_areas).toBeDefined();
      expect(contextPack.architecture_rules.length).toBeGreaterThan(0);
      expect(contextPack.security_rules.length).toBeGreaterThan(0);
      expect(contextPack.no_spend_rules.length).toBeGreaterThan(0);
      expect(contextPack.prohibited_actions).toContain("no_production_deploy");
    });
  });

  describe("3. Worker Selection Policy & Limits", () => {
    it("should respect max worker limit (<= 3 candidate workers, default 2-3)", () => {
      for (const type of SUPPORTED_TASK_TYPES) {
        const result = recommendWorkers(type, "M", "medium");
        expect(result.worker_count).toBeGreaterThanOrEqual(1);
        expect(result.worker_count).toBeLessThanOrEqual(3);
        expect(result.recommended_workers.length).toBe(result.worker_count);
      }
    });

    it("should select Base44 + Frontend Builder for UI tasks", () => {
      const result = recommendWorkers("ui");
      expect(result.recommended_workers).toContain("base44_mcp");
      expect(result.recommended_workers).toContain("frontend_builder_candidate");
    });

    it("should select Emergent + Claude Code for backend tasks", () => {
      const result = recommendWorkers("backend");
      expect(result.recommended_workers).toContain("emergent_mcp");
      expect(result.recommended_workers).toContain("claude_code");
    });

    it("should select Claude Code + Replit + Antigravity candidate for debugging", () => {
      const result = recommendWorkers("debugging");
      expect(result.recommended_workers).toContain("claude_code");
      expect(result.recommended_workers).toContain("replit_mcp");
      expect(result.recommended_workers).toContain("antigravity_candidate");
    });

    it("should select Frontend Builder + Emergent + Replit for full prototypes", () => {
      const result = recommendWorkers("full_prototype");
      expect(result.recommended_workers).toContain("frontend_builder_candidate");
      expect(result.recommended_workers).toContain("emergent_mcp");
      expect(result.recommended_workers).toContain("replit_mcp");
    });
  });

  describe("4. Fail-Closed Safety Rules", () => {
    it("should fail closed for missing workspace authorization", () => {
      const invalidInput: SoftwareTaskInput = {
        ...validBaseInput,
        workspace_id: "",
      };

      expect(() => validateTaskSafety(invalidInput)).toThrow(TaskPlannerSafetyError);
      expect(() => validateTaskSafety(invalidInput)).toThrowError(
        expect.objectContaining({ code: "MISSING_WORKSPACE_AUTHORIZATION" })
      );
    });

    it("should fail closed for missing repository/ref", () => {
      const invalidInput: SoftwareTaskInput = {
        ...validBaseInput,
        repository: "",
        ref: "",
      };

      expect(() => validateTaskSafety(invalidInput)).toThrow(TaskPlannerSafetyError);
      expect(() => validateTaskSafety(invalidInput)).toThrowError(
        expect.objectContaining({ code: "MISSING_REPOSITORY" })
      );
    });

    it("should fail closed for unknown task type", () => {
      const invalidInput: SoftwareTaskInput = {
        ...validBaseInput,
        task_type: "super_quantum_magic",
      };

      expect(() => validateTaskSafety(invalidInput)).toThrow(TaskPlannerSafetyError);
      expect(() => validateTaskSafety(invalidInput)).toThrowError(
        expect.objectContaining({ code: "UNKNOWN_TASK_TYPE" })
      );
    });

    it("should fail closed for ambiguous destructive task without human approval", () => {
      const invalidInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Wipe database and drop all tables",
        human_approved: false,
      };

      expect(() => validateTaskSafety(invalidInput)).toThrow(TaskPlannerSafetyError);
      expect(() => validateTaskSafety(invalidInput)).toThrowError(
        expect.objectContaining({ code: "AMBIGUOUS_DESTRUCTIVE_TASK" })
      );
    });

    it("should fail closed for production modification/deploy request without human approval", () => {
      const invalidInput: SoftwareTaskInput = {
        ...validBaseInput,
        objective: "Deploy to production environment",
        human_approved: false,
      };

      expect(() => validateTaskSafety(invalidInput)).toThrow(TaskPlannerSafetyError);
      expect(() => validateTaskSafety(invalidInput)).toThrowError(
        expect.objectContaining({ code: "PRODUCTION_MODIFICATION_REQUIRES_APPROVAL" })
      );
    });

    it("should fail closed if paid execution is requested when policy forbids spend", () => {
      const invalidInput: SoftwareTaskInput = {
        ...validBaseInput,
        requested_budget: {
          allow_spend: true,
          max_credits: 50,
        },
      };

      expect(() => validateTaskSafety(invalidInput)).toThrow(TaskPlannerSafetyError);
      expect(() => validateTaskSafety(invalidInput)).toThrowError(
        expect.objectContaining({ code: "PAID_EXECUTION_FORBIDDEN" })
      );
    });
  });

  describe("5. Zero-Cost & Non-Execution Assurance", () => {
    it("should ensure zero external HTTP calls during plan creation", () => {
      const plan = createTaskPlan(validBaseInput);
      expect(plan).toBeDefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should ensure zero builder dispatches and zero credit consumption", () => {
      const plan = createTaskPlan(validBaseInput);

      expect(plan.budget_policy.allow_spend).toBe(false);
      expect(plan.budget_policy.max_credits).toBe(0);
      expect(plan.budget_policy.policy_name).toBe("ZERO_COST_POLICY");
      expect(plan.forbidden_actions).toContain("no_paid_provider_calls");
      expect(plan.forbidden_actions).toContain("no_external_credits");
    });
  });
});
