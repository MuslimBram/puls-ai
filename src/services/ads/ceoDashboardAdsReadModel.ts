/**
 * PULSE AI — CEO DASHBOARD ADS READ MODEL (PHASE A3)
 *
 * Workspace-scoped read model for CEO Dashboard ads aggregation.
 * Combines normalized Meta & Google telemetry into non-sensitive dashboard view.
 * Zero credentials, zero access tokens, zero card data exposed.
 * Enforces strict workspace isolation.
 */

import { AdsRiskEvent } from "./adsRiskEventService";
import { NormalizedAdsTelemetry } from "./adsTelemetryNormalizer";

export interface ProviderConnectionHealth {
  provider: "meta_ads" | "google_ads" | "tiktok_ads";
  status: "connected" | "disconnected" | "error";
  ad_account_id?: string;
  last_synced_at?: string;
}

export interface CeoDashboardAdsReadModel {
  workspace_id: string;
  total_meta_spend: number;
  total_google_spend: number;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions_leads: number;
  overall_ctr: number;
  overall_cpc: number;
  overall_risk_score: number;
  overall_risk_level: "low" | "medium" | "high" | "critical";
  active_warnings_count: number;
  pending_approvals_count: number;
  blocked_automations_count: number;
  provider_connections: ProviderConnectionHealth[];
  recent_risk_events: Omit<AdsRiskEvent, "telemetry_snapshot">[];
  generated_at: string;
}

/**
 * Builds workspace-scoped CEO Dashboard Ads Read Model from workspace telemetry and risk events.
 * Enforces strict workspace boundary (will throw if records belong to another workspace).
 */
export function buildCeoDashboardAdsReadModel(
  targetWorkspaceId: string,
  metaTelemetry?: NormalizedAdsTelemetry,
  googleTelemetry?: NormalizedAdsTelemetry,
  riskEvents: AdsRiskEvent[] = [],
  connections: ProviderConnectionHealth[] = []
): CeoDashboardAdsReadModel {
  // Validate workspace isolation
  if (metaTelemetry && metaTelemetry.workspace_id !== targetWorkspaceId) {
    throw new Error(`Workspace isolation violation: Meta telemetry workspace (${metaTelemetry.workspace_id}) does not match target (${targetWorkspaceId})`);
  }
  if (googleTelemetry && googleTelemetry.workspace_id !== targetWorkspaceId) {
    throw new Error(`Workspace isolation violation: Google telemetry workspace (${googleTelemetry.workspace_id}) does not match target (${targetWorkspaceId})`);
  }

  const workspaceRiskEvents = riskEvents.filter((e) => {
    if (e.workspace_id !== targetWorkspaceId) {
      throw new Error(`Workspace isolation violation: Risk event workspace (${e.workspace_id}) does not match target (${targetWorkspaceId})`);
    }
    return true;
  });

  const metaSpend = metaTelemetry?.current_spend ?? 0;
  const googleSpend = googleTelemetry?.current_spend ?? 0;
  const totalSpend = metaSpend + googleSpend;

  const metaImpressions = metaTelemetry?.impressions ?? 0;
  const googleImpressions = googleTelemetry?.impressions ?? 0;
  const totalImpressions = metaImpressions + googleImpressions;

  const metaClicks = metaTelemetry?.clicks ?? 0;
  const googleClicks = googleTelemetry?.clicks ?? 0;
  const totalClicks = metaClicks + googleClicks;

  const metaLeads = metaTelemetry?.leads ?? 0;
  const googleConversions = googleTelemetry?.conversions ?? 0;
  const totalConversions = metaLeads + googleConversions;

  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const overallCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  // Aggregate risk metrics
  let maxRiskScore = 0;
  let activeWarnings = 0;
  let pendingApprovals = 0;
  let blockedAutomations = 0;

  for (const evt of workspaceRiskEvents) {
    if (evt.risk_score > maxRiskScore) maxRiskScore = evt.risk_score;
    if (evt.decision === "WARN") activeWarnings++;
    if (evt.decision === "REQUIRE_HUMAN_APPROVAL") pendingApprovals++;
    if (evt.decision === "BLOCK_PULSE_AUTOMATION") blockedAutomations++;
  }

  let overallRiskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (maxRiskScore >= 80) overallRiskLevel = "critical";
  else if (maxRiskScore >= 60) overallRiskLevel = "high";
  else if (maxRiskScore >= 40) overallRiskLevel = "medium";

  const sanitizedEvents = workspaceRiskEvents.map(({ telemetry_snapshot: _snap, ...evt }) => evt);

  return {
    workspace_id: targetWorkspaceId,
    total_meta_spend: Math.round(metaSpend * 100) / 100,
    total_google_spend: Math.round(googleSpend * 100) / 100,
    total_spend: Math.round(totalSpend * 100) / 100,
    total_impressions: totalImpressions,
    total_clicks: totalClicks,
    total_conversions_leads: Math.round(totalConversions * 100) / 100,
    overall_ctr: Math.round(overallCtr * 100) / 100,
    overall_cpc: Math.round(overallCpc * 100) / 100,
    overall_risk_score: maxRiskScore,
    overall_risk_level: overallRiskLevel,
    active_warnings_count: activeWarnings,
    pending_approvals_count: pendingApprovals,
    blocked_automations_count: blockedAutomations,
    provider_connections: connections,
    recent_risk_events: sanitizedEvents,
    generated_at: new Date().toISOString(),
  };
}
