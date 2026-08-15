/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3B: NON-EXECUTING BROKER DISPATCHER STUB
 *
 * Defines the typed interface for future worker execution dispatch.
 * In Phase 3B, this is strictly a NON-EXECUTING stub.
 *
 * NEVER invokes builder-adapter-router Edge Function, MCP endpoints, or external HTTP calls.
 * ZERO credits consumed.
 */

import { ExecutionPlan, SelectedWorkerConfig, DispatchResult } from "./types";

export interface IBrokerDispatcher {
  dispatchExecution(
    plan: ExecutionPlan,
    worker: SelectedWorkerConfig
  ): Promise<DispatchResult>;
}

export class NonExecutingBrokerDispatcher implements IBrokerDispatcher {
  public async dispatchExecution(
    plan: ExecutionPlan,
    worker: SelectedWorkerConfig
  ): Promise<DispatchResult> {
    // Strictly non-executing in Phase 3B
    return {
      dispatched: false,
      execution_id: plan.execution_id,
      worker_id: worker.worker_id,
      status: "DISPATCH_NOT_ALLOWED_PHASE_3B",
      reason: `Phase 3B is PLANNING ONLY. Worker '${worker.worker_id}' dispatch blocked. No builder-adapter-router or external HTTP calls executed.`,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Singleton instance of the non-executing broker dispatcher stub.
 */
export const defaultDispatcher = new NonExecutingBrokerDispatcher();

export function dispatchWorkerStub(
  workerId: SelectedWorkerConfig["worker_id"],
  executionId: string,
  plan: ExecutionPlan
): DispatchResult {
  return {
    dispatched: false,
    execution_id: executionId,
    worker_id: workerId,
    status: "DISPATCH_NOT_ALLOWED_PHASE_3B",
    reason: `Phase 3B is PLANNING ONLY. Worker '${workerId}' dispatch blocked.`,
    timestamp: new Date().toISOString(),
  };
}
