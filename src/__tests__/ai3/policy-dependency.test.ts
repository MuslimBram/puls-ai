import { describe, expect, it, vi } from "vitest";

import { validateAndClampActionParams } from "../../../supabase/functions/_shared/action-contract.ts";
import { AI3_SUPPORTED_EXECUTOR_TYPES } from "../../../supabase/functions/_shared/ai3-executor-contract.ts";
import { resolveValidationPolicyForAction } from "../../../supabase/functions/_shared/ai3-policy-gate.ts";

async function simulateApprovalValidationGate(
  actionType: string,
  payload: Record<string, unknown>,
  loadPolicy: Parameters<typeof resolveValidationPolicyForAction>[2],
) {
  const resolved = await resolveValidationPolicyForAction(actionType, payload, loadPolicy);
  if (resolved.status === "POLICY_NOT_CONFIGURED") return { ok: false as const, error: "POLICY_NOT_CONFIGURED" };
  if (resolved.status === "POLICY_LOAD_FAILED") return { ok: false as const, error: "POLICY_LOAD_FAILED" };
  return {
    ok: true as const,
    validation: validateAndClampActionParams(actionType, payload, resolved.policy),
  };
}

describe("AI-3 policy dependency gate", () => {
  it("create_booking approval does not query/require commercial policy", async () => {
    const loadPolicy = vi.fn(async () => ({
      ok: false,
      error: 'relation "workspace_settings" does not exist',
    }));

    const result = await simulateApprovalValidationGate(
      "create_booking",
      { client_name: "Ada", date: "2026-08-24", time: "09:30" },
      loadPolicy,
    );

    expect(loadPolicy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("create_booking proceeds even when workspace_settings schema is absent", async () => {
    const result = await simulateApprovalValidationGate(
      "create_booking",
      { client_name: "Ada", date: "2026-08-24", time: "09:30" },
      async () => ({ ok: false, error: 'relation "workspace_settings" does not exist' }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.validation.valid).toBe(true);
    }
  });

  it("commercial action requiring policy returns POLICY_NOT_CONFIGURED when policy source is absent", async () => {
    const result = await simulateApprovalValidationGate(
      "launch_campaign",
      { campaign_id: "cmp-1" },
      async () => ({ ok: false, error: 'relation "workspace_settings" does not exist' }),
    );

    expect(result).toEqual({ ok: false, error: "POLICY_NOT_CONFIGURED" });
  });

  it("missing policy never falls back to invented commercial limits", async () => {
    const result = await simulateApprovalValidationGate(
      "launch_campaign",
      { campaign_id: "cmp-1", campaign_contacts: 10, message_batch_size: 5 },
      async () => ({ ok: true, configured: false, policy: {} }),
    );

    expect(result).toEqual({ ok: false, error: "POLICY_NOT_CONFIGURED" });
  });

  it("launch_campaign is supported executor but policy blocked when policy source is missing", async () => {
    const gate = await simulateApprovalValidationGate(
      "launch_campaign",
      { campaign_id: "cmp-1" },
      async () => ({ ok: true, configured: false, policy: {} }),
    );

    expect(AI3_SUPPORTED_EXECUTOR_TYPES.has("launch_campaign")).toBe(true);
    const classification = AI3_SUPPORTED_EXECUTOR_TYPES.has("launch_campaign") && !gate.ok && gate.error === "POLICY_NOT_CONFIGURED"
      ? "SUPPORTED_EXECUTOR_BUT_POLICY_BLOCKED"
      : "OTHER";
    expect(classification).toBe("SUPPORTED_EXECUTOR_BUT_POLICY_BLOCKED");
  });
});
