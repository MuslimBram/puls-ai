import { describe, it, expect } from "vitest";
import {
  evaluateAdsRisk,
  createHumanApprovalPayload,
  formatPulseBrainRiskContext,
} from "../../services/aiGuard/aiGuardEngine";
import { AiGuardTelemetryInput } from "../../types/aiGuard";

describe("Phase A2: AI Guard Deterministic Security & Risk Engine", () => {
  const WORKSPACE_A_ID = "ws-alpha-111";
  const WORKSPACE_B_ID = "ws-beta-222";

  const normalTelemetry: AiGuardTelemetryInput = {
    workspace_id: WORKSPACE_A_ID,
    provider: "meta_ads",
    ad_account_id: "act_1001",
    campaign_id: "cmp_1",
    current_spend: 100,
    baseline_spend: 95,
    is_known_account: true,
    is_known_campaign: true,
    campaign_status: "active",
  };

  it("1. normal spend -> ALLOW", () => {
    const res = evaluateAdsRisk(normalTelemetry);
    expect(res.decision).toBe("ALLOW");
    expect(res.risk_score).toBe(0);
    expect(res.risk_level).toBe("low");
    expect(res.block_automation).toBe(false);
  });

  it("2. small unusual movement -> WARN", () => {
    const telemetry: AiGuardTelemetryInput = {
      ...normalTelemetry,
      current_spend: 160, // 60% increase (exceeds default 50% threshold)
      baseline_spend: 100,
    };
    const res = evaluateAdsRisk(telemetry);
    expect(res.decision).toBe("WARN");
    expect(res.risk_score).toBe(45);
    expect(res.risk_level).toBe("medium");
    expect(res.triggered_rules).toContain("MODERATE_SPEND_MOVEMENT");
  });

  it("3. large spend spike -> REQUIRE_HUMAN_APPROVAL", () => {
    const telemetry: AiGuardTelemetryInput = {
      ...normalTelemetry,
      previous_budget: 1000,
      current_budget: 1500, // 50% budget increase (exceeds 30% threshold)
    };
    const res = evaluateAdsRisk(telemetry);
    expect(res.decision).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(res.requires_human_approval).toBe(true);
    expect(res.risk_score).toBe(65);
    expect(res.triggered_rules).toContain("BUDGET_INCREASE_EXCEEDED");
  });

  it("4. extreme anomaly / compromise signal -> BLOCK_PULSE_AUTOMATION", () => {
    const telemetry: AiGuardTelemetryInput = {
      ...normalTelemetry,
      current_spend: 400, // 300% increase (4x baseline)
      baseline_spend: 100,
    };
    const res = evaluateAdsRisk(telemetry);
    expect(res.decision).toBe("BLOCK_PULSE_AUTOMATION");
    expect(res.block_automation).toBe(true);
    expect(res.risk_score).toBe(85);
    expect(res.triggered_rules).toContain("EXTREME_SPEND_SPIKE");
  });

  it("5. budget increase beyond workspace threshold -> REQUIRE_HUMAN_APPROVAL", () => {
    const telemetry: AiGuardTelemetryInput = {
      ...normalTelemetry,
      previous_budget: 500,
      current_budget: 800, // 60% increase
    };
    const res = evaluateAdsRisk(telemetry, { max_budget_increase_percent: 25 });
    expect(res.decision).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(res.triggered_rules).toContain("BUDGET_INCREASE_EXCEEDED");
  });

  it("6. unknown campaign activation -> REQUIRE_HUMAN_APPROVAL", () => {
    const telemetry: AiGuardTelemetryInput = {
      ...normalTelemetry,
      is_known_campaign: false,
      campaign_status: "active",
    };
    const res = evaluateAdsRisk(telemetry);
    expect(res.decision).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(res.triggered_rules).toContain("UNKNOWN_CAMPAIGN_ACTIVATION");
  });

  it("7. auth/token compromise signal -> BLOCK_PULSE_AUTOMATION", () => {
    const telemetry: AiGuardTelemetryInput = {
      ...normalTelemetry,
      token_anomaly: true,
    };
    const res = evaluateAdsRisk(telemetry);
    expect(res.decision).toBe("BLOCK_PULSE_AUTOMATION");
    expect(res.risk_score).toBe(100);
    expect(res.risk_level).toBe("critical");
    expect(res.triggered_rules).toContain("AUTH_TOKEN_COMPROMISE");
  });

  it("8. workspace A thresholds never affect workspace B", () => {
    const telemetryA: AiGuardTelemetryInput = {
      ...normalTelemetry,
      workspace_id: WORKSPACE_A_ID,
      current_spend: 140,
      baseline_spend: 100, // 40% increase
    };
    const telemetryB: AiGuardTelemetryInput = {
      ...normalTelemetry,
      workspace_id: WORKSPACE_B_ID,
      current_spend: 140,
      baseline_spend: 100, // 40% increase
    };

    // Workspace A custom threshold: 30% max spend increase -> WARN
    const resA = evaluateAdsRisk(telemetryA, { max_spend_increase_percent: 30 });
    // Workspace B default threshold: 50% max spend increase -> ALLOW
    const resB = evaluateAdsRisk(telemetryB, { max_spend_increase_percent: 50 });

    expect(resA.decision).toBe("WARN");
    expect(resB.decision).toBe("ALLOW");
  });

  it("9. same input produces same result (pure determinism)", () => {
    const res1 = evaluateAdsRisk(normalTelemetry);
    const res2 = evaluateAdsRisk(normalTelemetry);
    expect(res1.risk_score).toBe(res2.risk_score);
    expect(res1.decision).toBe(res2.decision);
    expect(res1.triggered_rules).toEqual(res2.triggered_rules);
  });

  it("10. missing billing telemetry does NOT invent payment risk", () => {
    const telemetryNoBilling: AiGuardTelemetryInput = {
      ...normalTelemetry,
      billing_signal: undefined,
    };
    const res = evaluateAdsRisk(telemetryNoBilling);
    expect(res.triggered_rules).not.toContain("PROVIDER_BILLING_FAILURE");
    expect(res.decision).toBe("ALLOW");
  });

  it("11. Human Approval integration adapter contract", () => {
    const telemetry: AiGuardTelemetryInput = {
      ...normalTelemetry,
      is_known_campaign: false,
      campaign_status: "active",
    };
    const evaluation = evaluateAdsRisk(telemetry);
    const approvalPayload = createHumanApprovalPayload(evaluation);

    expect(approvalPayload.workspace_id).toBe(WORKSPACE_A_ID);
    expect(approvalPayload.source).toBe("AI_GUARD");
    expect(approvalPayload.status).toBe("pending_review");
    expect(approvalPayload.title.toLowerCase()).toContain("meta_ads");
  });

  it("12. Pulse Brain integration context formatting", () => {
    const evaluation = evaluateAdsRisk(normalTelemetry);
    const brainContext = formatPulseBrainRiskContext(evaluation);

    expect(brainContext.ai_guard_decision).toBe("ALLOW");
    expect(brainContext.ai_guard_risk_score).toBe(0);
    expect(brainContext.ai_guard_block_automation).toBe(false);
  });
});
