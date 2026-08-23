/**
 * PULSE AI — AI SOFTWARE FACTORY
 * PHASE 3B: PHASE 2B BRIDGE MAPPING
 *
 * Provides authoritative mapping between Phase 3B worker identities and canonical Phase 2B adapter keys.
 * DOES NOT modify or duplicate Phase 2B runtime connection logic.
 */

import { WorkerType, WorkerClass } from "./types";

export interface Phase2BBridgeMapping {
  worker_id: WorkerType;
  adapter_key: string | null;
  worker_class: WorkerClass;
  status: "active_adapter" | "local_candidate";
  requires_external_call: boolean;
}

export const PHASE_2B_BRIDGE_REGISTRY: Record<WorkerType, Phase2BBridgeMapping> = {
  frontend_builder_candidate: {
    worker_id: "frontend_builder_candidate",
    adapter_key: null,
    worker_class: "builder",
    status: "local_candidate",
    requires_external_call: false,
  },
  emergent_mcp: {
    worker_id: "emergent_mcp",
    adapter_key: "emergent_mcp",
    worker_class: "builder",
    status: "active_adapter",
    requires_external_call: true,
  },
  base44_mcp: {
    worker_id: "base44_mcp",
    adapter_key: "base44_mcp",
    worker_class: "builder",
    status: "active_adapter",
    requires_external_call: true,
  },
  replit_mcp: {
    worker_id: "replit_mcp",
    adapter_key: "replit_mcp",
    worker_class: "builder",
    status: "active_adapter",
    requires_external_call: true,
  },
  claude_code: {
    worker_id: "claude_code",
    adapter_key: "claude_code",
    worker_class: "engineering_agent",
    status: "active_adapter",
    requires_external_call: true,
  },
  antigravity_candidate: {
    worker_id: "antigravity_candidate",
    adapter_key: null, // No Phase 2B adapter key exists
    worker_class: "engineering_agent",
    status: "local_candidate",
    requires_external_call: false, // Local environment execution
  },
};

/**
 * Returns the canonical Phase 2B adapter_key for a given worker identity.
 * Returns null for antigravity_candidate.
 */
export function getPhase2BAdapterKey(workerId: WorkerType): string | null {
  return PHASE_2B_BRIDGE_REGISTRY[workerId]?.adapter_key ?? null;
}

/**
 * Classifies worker into "builder" or "engineering_agent".
 */
export function getWorkerClass(workerId: WorkerType): WorkerClass {
  return PHASE_2B_BRIDGE_REGISTRY[workerId]?.worker_class ?? "builder";
}

/**
 * Checks whether calling this worker requires an external HTTP/provider API call.
 * Antigravity returns false for local environment execution.
 */
export function isExternalCallRequired(workerId: WorkerType): boolean {
  return PHASE_2B_BRIDGE_REGISTRY[workerId]?.requires_external_call ?? true;
}
