import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type LeahRoutingDecision = {
  decision: "route" | "approval_required";
  provider: string;
  model: string;
  billing_class: "free" | "paid";
  estimated_cost_micros: number | null;
  approval_required: boolean;
  approval_request_id?: string;
  reason: string;
};

/**
 * Central LEAH routing entry point.
 * The caller never chooses a provider directly. The database policy decides:
 * free quota first, then lowest known cost, otherwise an explicit paid approval gate.
 */
export async function routeLeahRequest(input: {
  admin: SupabaseClient;
  workspaceId: string;
  logicalRequestId: string;
  capability?: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
}): Promise<LeahRoutingDecision> {
  const { data, error } = await input.admin.rpc("leah_route_provider_for_request", {
    _workspace_id: input.workspaceId,
    _logical_request_id: input.logicalRequestId,
    _capability: input.capability ?? "general",
    _estimated_input_tokens: Math.max(0, Math.floor(input.estimatedInputTokens ?? 0)),
    _estimated_output_tokens: Math.max(0, Math.floor(input.estimatedOutputTokens ?? 0)),
  });

  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("LEAH routing decision unavailable");

  const result = data as Record<string, unknown>;
  if (result.decision !== "route" && result.decision !== "approval_required") {
    throw new Error("Invalid LEAH routing decision");
  }
  if (typeof result.provider !== "string" || typeof result.model !== "string") {
    throw new Error("Invalid LEAH routing provider selection");
  }

  return {
    decision: result.decision,
    provider: result.provider,
    model: result.model,
    billing_class: result.billing_class === "free" ? "free" : "paid",
    estimated_cost_micros:
      typeof result.estimated_cost_micros === "number" ? result.estimated_cost_micros : null,
    approval_required: result.approval_required === true,
    approval_request_id:
      typeof result.approval_request_id === "string" ? result.approval_request_id : undefined,
    reason: typeof result.reason === "string" ? result.reason : "policy",
  };
}
