/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3 FACTORY ORCHESTRATION CONTRACT & PIPELINE
 *
 * Coordinates TaskPlanner, ContextPacker, AgentRouter, DispatcherStub, QualityGate, PulseJudge, and RepairLoop.
 *
 * CONTRACT STATES ONLY for Final Validation / Merge & Deploy:
 * - DO NOT execute actual code merges
 * - DO NOT execute deployments
 * - DO NOT call external MCP, HTTP, or provider APIs
 * - ZERO credits consumed
 */

import {
  SoftwareTaskInput,
  FactoryPipelineResult,
  WorkerResult,
} from "./types";
import { createTaskPlan } from "./taskPlanner";
import { createContextPack } from "./contextPacker";
import { createExecutionPlan } from "./agentRouter";
import { dispatchWorkerStub } from "./dispatcherStub";
import { evaluateQualityGate } from "./qualityGate";
import { evaluatePulseJudge } from "./pulseJudge";
import { evaluateRepairLoopState } from "./repairLoop";

/**
 * Runs the completed end-to-end Factory Orchestration Pipeline in non-executing mode.
 */
export function runFactoryPipeline(
  input: SoftwareTaskInput,
  mockWorkerResults?: WorkerResult[]
): FactoryPipelineResult {
  const factoryExecId = `fac_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Step 1: Task Planning
  const taskPlan = createTaskPlan(input);

  // Step 2: Context Packing
  const contextPack = createContextPack(taskPlan);

  // Step 3: Multi-Builder / Agent Router
  const executionPlan = createExecutionPlan(taskPlan, contextPack);

  // Step 4: Dispatcher Stub (Broker only, 0 execution)
  executionPlan.selected_workers.forEach((w) => {
    dispatchWorkerStub(w.worker_id, executionPlan.execution_id, executionPlan);
  });

  // If no worker results supplied, return early at WORKER_DISPATCH step
  if (!mockWorkerResults || mockWorkerResults.length === 0) {
    return {
      factory_execution_id: factoryExecId,
      task_id: taskPlan.task_id,
      current_step: "WORKER_DISPATCH",
      task_plan: taskPlan,
      context_pack: contextPack,
      execution_plan: executionPlan,
      quality_report: null,
      judge_decision: null,
      repair_loop_state: null,
      completed: false,
      requires_human_approval: executionPlan.human_approval_required.required,
      blocked_reason: executionPlan.blocked_reason,
      created_at: new Date().toISOString(),
    };
  }

  // Step 5: Quality Gate Evaluation
  const qualityReport = evaluateQualityGate(taskPlan, contextPack, executionPlan, mockWorkerResults);

  // Step 6: Pulse Judge Evaluation
  const judgeDecision = evaluatePulseJudge(taskPlan, contextPack, executionPlan, qualityReport, mockWorkerResults);

  // Step 7: Repair Loop Evaluation
  const repairLoopState = evaluateRepairLoopState(taskPlan, contextPack, executionPlan, qualityReport, judgeDecision);

  // Step 8 & 9: Determine Final Pipeline Status
  let currentStep: FactoryPipelineResult["current_step"] = "REPAIR_LOOP_EVALUATION";
  let completed = false;
  const requiresHumanApproval = judgeDecision.requires_human_review || repairLoopState.requires_human_review;
  let blockedReason = repairLoopState.stop_reason;

  if (judgeDecision.decision === "select_base" && !requiresHumanApproval) {
    currentStep = "FINAL_VALIDATION"; // Future contract state
    completed = true;
    blockedReason = null;
  } else if (requiresHumanApproval) {
    currentStep = "HUMAN_APPROVAL_GATE";
  }

  return {
    factory_execution_id: factoryExecId,
    task_id: taskPlan.task_id,
    current_step: currentStep,
    task_plan: taskPlan,
    context_pack: contextPack,
    execution_plan: executionPlan,
    quality_report: qualityReport,
    judge_decision: judgeDecision,
    repair_loop_state: repairLoopState,
    completed,
    requires_human_approval: requiresHumanApproval,
    blocked_reason: blockedReason,
    created_at: new Date().toISOString(),
  };
}
