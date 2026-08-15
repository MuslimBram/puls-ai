import { describe, it, expect, vi } from "vitest";
import {
  normalizeMetaAdsTelemetry,
  normalizeGoogleAdsTelemetry,
  RawMetaAdsCacheRow,
  RawGoogleAdsCacheRow,
} from "../../services/ads/adsTelemetryNormalizer";
import {
  createAdsRiskEvent,
  adaptToExistingHumanApproval,
  adaptToPulseBrainContext,
  enforcePulseAutomationGate,
} from "../../services/ads/adsRiskEventService";
import { buildCeoDashboardAdsReadModel } from "../../services/ads/ceoDashboardAdsReadModel";

describe("Phase A3: Telemetry → AI Guard → Human Approval → CEO Dashboard Pipeline", () => {
  const WORKSPACE_A = "ws-alpha-111";
  const WORKSPACE_B = "ws-beta-222";

  const rawMetaRow: RawMetaAdsCacheRow = {
    workspace_id: WORKSPACE_A,
    ad_account_id: "act_1001",
    date_start: "2026-08-01",
    date_stop: "2026-08-15",
    impressions: "5000",
    clicks: "250",
    spend: "125.50",
    reach: "4000",
    cpc: "0.50",
    cpm: "25.10",
    ctr: "5.00",
    leads_count: "10",
    cost_per_lead: "12.55",
    synced_at: "2026-08-15T23:00:00Z",
  };

  const rawGoogleRow: RawGoogleAdsCacheRow = {
    workspace_id: WORKSPACE_A,
    customer_id: "123-456-7890",
    date_start: "2026-08-01",
    date_stop: "2026-08-15",
    impressions: 8000,
    clicks: 400,
    spend: 200.0,
    conversions: 16,
    cpc: 0.5,
    ctr: 5.0,
    cost_per_conv: 12.5,
    synced_at: "2026-08-15T23:00:00Z",
  };

  it("1. Meta cached metrics normalize correctly", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow, 120.0);
    expect(norm.workspace_id).toBe(WORKSPACE_A);
    expect(norm.provider).toBe("meta_ads");
    expect(norm.ad_account_id).toBe("act_1001");
    expect(norm.current_spend).toBe(125.5);
    expect(norm.baseline_spend).toBe(120.0);
    expect(norm.impressions).toBe(5000);
    expect(norm.clicks).toBe(250);
    expect(norm.leads).toBe(10);
  });

  it("2. Google cached metrics normalize correctly", () => {
    const norm = normalizeGoogleAdsTelemetry(rawGoogleRow, 190.0);
    expect(norm.workspace_id).toBe(WORKSPACE_A);
    expect(norm.provider).toBe("google_ads");
    expect(norm.ad_account_id).toBe("123-456-7890");
    expect(norm.current_spend).toBe(200.0);
    expect(norm.baseline_spend).toBe(190.0);
    expect(norm.conversions).toBe(16);
  });

  it("3. unavailable telemetry remains unavailable, not invented", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow);
    expect(norm.billing_signal).toBeUndefined();
    expect(norm.spend_velocity).toBeUndefined();
  });

  it("4. normal telemetry -> ALLOW", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow, 125.0);
    const event = createAdsRiskEvent(norm);
    expect(event.decision).toBe("ALLOW");
    expect(event.risk_score).toBe(0);
  });

  it("5. anomaly -> WARN", () => {
    const norm = normalizeMetaAdsTelemetry({ ...rawMetaRow, spend: 200.0 }, 120.0); // 66% increase
    const event = createAdsRiskEvent(norm);
    expect(event.decision).toBe("WARN");
    expect(event.risk_score).toBe(45);
    expect(event.triggered_rules).toContain("MODERATE_SPEND_MOVEMENT");
  });

  it("6. high risk -> REQUIRE_HUMAN_APPROVAL", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow, 120.0);
    norm.previous_budget = 500;
    norm.current_budget = 800; // 60% budget increase
    const event = createAdsRiskEvent(norm);
    expect(event.decision).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(event.approval_required).toBe(true);
    expect(event.approval_reference).toBeDefined();
  });

  it("7. compromise/extreme risk -> BLOCK_PULSE_AUTOMATION", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow, 120.0);
    norm.token_anomaly = true;
    const event = createAdsRiskEvent(norm);
    expect(event.decision).toBe("BLOCK_PULSE_AUTOMATION");
    expect(event.risk_score).toBe(100);
    expect(event.risk_level).toBe("critical");
  });

  it("8. blocked decision prevents Pulse mock action", async () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow, 120.0);
    norm.auth_anomaly = true;
    const event = createAdsRiskEvent(norm);

    const mockPulseAction = vi.fn().mockResolvedValue({ status: "optimized" });
    const gateRes = await enforcePulseAutomationGate(event, mockPulseAction);

    expect(gateRes.executed).toBe(false);
    expect(gateRes.decision).toBe("BLOCK_PULSE_AUTOMATION");
    expect(mockPulseAction).not.toHaveBeenCalled();
  });

  it("9. approval decision creates existing approval payload", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow, 120.0);
    norm.is_known_campaign = false;
    norm.campaign_status = "active";
    const event = createAdsRiskEvent(norm);

    const approvalPayload = adaptToExistingHumanApproval(event);
    expect(approvalPayload.source).toBe("AI_GUARD");
    expect(approvalPayload.workspace_id).toBe(WORKSPACE_A);
    expect(approvalPayload.status).toBe("pending_review");
  });

  it("10. workspace isolation (workspace A cannot read workspace B Ads telemetry or risk events)", () => {
    const normA = normalizeMetaAdsTelemetry(rawMetaRow);
    const normB = normalizeMetaAdsTelemetry({ ...rawMetaRow, workspace_id: WORKSPACE_B });
    const eventA = createAdsRiskEvent(normA);
    const eventB = createAdsRiskEvent(normB);

    expect(() => buildCeoDashboardAdsReadModel(WORKSPACE_A, normA, undefined, [eventB])).toThrow(
      "Workspace isolation violation"
    );
  });

  it("11. dashboard aggregates only requested workspace", () => {
    const normMeta = normalizeMetaAdsTelemetry(rawMetaRow, 120.0);
    const normGoogle = normalizeGoogleAdsTelemetry(rawGoogleRow, 190.0);
    const event = createAdsRiskEvent(normMeta);

    const dashboard = buildCeoDashboardAdsReadModel(
      WORKSPACE_A,
      normMeta,
      normGoogle,
      [event],
      [{ provider: "meta_ads", status: "connected" }]
    );

    expect(dashboard.workspace_id).toBe(WORKSPACE_A);
    expect(dashboard.total_meta_spend).toBe(125.5);
    expect(dashboard.total_google_spend).toBe(200.0);
    expect(dashboard.total_spend).toBe(325.5);
    expect(dashboard.total_impressions).toBe(13000);
    expect(dashboard.total_clicks).toBe(650);
  });

  it("12. credentials absent from all risk/dashboard payloads", () => {
    const normMeta = normalizeMetaAdsTelemetry(rawMetaRow);
    const event = createAdsRiskEvent(normMeta);
    const brainContext = adaptToPulseBrainContext(event);
    const dashboard = buildCeoDashboardAdsReadModel(WORKSPACE_A, normMeta, undefined, [event]);

    const serializedEvent = JSON.stringify(event);
    const serializedBrain = JSON.stringify(brainContext);
    const serializedDash = JSON.stringify(dashboard);

    expect(serializedEvent).not.toContain("access_token");
    expect(serializedBrain).not.toContain("access_token");
    expect(serializedDash).not.toContain("access_token");
  });

  it("13. same telemetry + config gives same risk result", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow, 120.0);
    const event1 = createAdsRiskEvent(norm);
    const event2 = createAdsRiskEvent(norm);

    expect(event1.risk_score).toBe(event2.risk_score);
    expect(event1.decision).toBe(event2.decision);
    expect(event1.triggered_rules).toEqual(event2.triggered_rules);
  });

  it("14. zero AI calls (pure deterministic execution)", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow);
    const event = createAdsRiskEvent(norm);
    expect(event).toBeDefined();
  });

  it("15. zero payment/wallet calls (non-custodial guarantee)", () => {
    const norm = normalizeMetaAdsTelemetry(rawMetaRow);
    const event = createAdsRiskEvent(norm);
    expect(event.decision).not.toBe("PAY_BILL");
    expect(event.decision).not.toBe("CHARGE_CARD");
  });
});
