import type { WorkspacePolicy } from "./action-contract.ts";

export interface PolicyResult {
  ok: boolean;
  policy?: WorkspacePolicy;
  configured?: boolean;
  error?: string;
}

export type PolicyResolutionStatus = "OK" | "POLICY_NOT_CONFIGURED" | "POLICY_LOAD_FAILED";

export interface ResolvedValidationPolicy {
  ok: boolean;
  status: PolicyResolutionStatus;
  requiresExplicit: boolean;
  configured: boolean;
  policy: WorkspacePolicy;
  error?: string;
}

export function requiresExplicitPolicy(actionType: string, params: Record<string, unknown>): boolean {
  if ([
    "send_message",
    "launch_campaign",
    "bulk_email",
    "bulk_sms",
    "create_offer",
    "suggest_offer",
    "issue_reward",
    "issue_discount",
    "issue_referral",
  ].includes(actionType)) {
    return true;
  }

  return [
    "discount_percent",
    "offer_value",
    "reward_points",
    "referral_credit",
    "campaign_contacts",
    "message_batch_size",
  ].some((key) => params[key] !== undefined);
}

export function isMissingPolicySchemaError(error: string | undefined): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return normalized.includes("relation") && normalized.includes("does not exist");
}

export async function resolveValidationPolicyForAction(
  actionType: string,
  params: Record<string, unknown>,
  loadPolicy: () => Promise<PolicyResult>,
): Promise<ResolvedValidationPolicy> {
  const explicitPolicyRequired = requiresExplicitPolicy(actionType, params);

  if (!explicitPolicyRequired) {
    return {
      ok: true,
      status: "OK",
      requiresExplicit: false,
      configured: false,
      policy: {},
    };
  }

  const policyResult = await loadPolicy();
  if (!policyResult.ok) {
    if (isMissingPolicySchemaError(policyResult.error)) {
      return {
        ok: false,
        status: "POLICY_NOT_CONFIGURED",
        requiresExplicit: true,
        configured: false,
        policy: {},
      };
    }

    return {
      ok: false,
      status: "POLICY_LOAD_FAILED",
      requiresExplicit: true,
      configured: false,
      policy: {},
      error: policyResult.error,
    };
  }

  if (!policyResult.configured) {
    return {
      ok: false,
      status: "POLICY_NOT_CONFIGURED",
      requiresExplicit: true,
      configured: false,
      policy: {},
    };
  }

  return {
    ok: true,
    status: "OK",
    requiresExplicit: true,
    configured: true,
    policy: policyResult.policy ?? {},
  };
}
