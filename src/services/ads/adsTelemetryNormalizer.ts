/**
 * PULSE AI — ADS TELEMETRY NORMALIZER (PHASE A3)
 *
 * Normalizes raw cache records (meta_ads_cache & google_ads_cache) into
 * provider-neutral telemetry schema compatible with AI Guard risk engine.
 *
 * NON-CUSTODIAL & FAITHFUL:
 * - If a provider or cache row does not expose a signal, set it as undefined/unknown.
 * - NEVER fabricate billing failures, payment risk, device telemetry, or campaign budgets.
 */

import { AiGuardTelemetryInput } from "../../types/aiGuard";

export interface RawMetaAdsCacheRow {
  workspace_id: string;
  ad_account_id: string;
  date_start: string;
  date_stop: string;
  impressions?: number | string;
  clicks?: number | string;
  spend?: number | string;
  reach?: number | string;
  cpc?: number | string;
  cpm?: number | string;
  ctr?: number | string;
  leads_count?: number | string;
  cost_per_lead?: number | string;
  raw_data?: Record<string, unknown>;
  synced_at?: string;
}

export interface RawGoogleAdsCacheRow {
  workspace_id: string;
  customer_id: string;
  date_start: string;
  date_stop: string;
  impressions?: number | string;
  clicks?: number | string;
  spend?: number | string;
  conversions?: number | string;
  cpc?: number | string;
  ctr?: number | string;
  cost_per_conv?: number | string;
  raw_data?: Record<string, unknown>;
  synced_at?: string;
}

export interface NormalizedAdsTelemetry extends AiGuardTelemetryInput {
  period_start: string;
  period_end: string;
  reach?: number;
  leads?: number;
  cpc?: number;
  cpm?: number;
  ctr?: number;
  cost_per_conversion?: number;
  cost_per_lead?: number;
  synced_at?: string;
}

/**
 * Normalizes raw Meta Ads cache record into provider-neutral telemetry.
 */
export function normalizeMetaAdsTelemetry(
  row: RawMetaAdsCacheRow,
  baselineSpend = 0,
  connectionStatus: "connected" | "disconnected" | "error" = "connected"
): NormalizedAdsTelemetry {
  const spend = typeof row.spend === "string" ? parseFloat(row.spend) : Number(row.spend ?? 0);
  const impressions = typeof row.impressions === "string" ? parseInt(row.impressions, 10) : Number(row.impressions ?? 0);
  const clicks = typeof row.clicks === "string" ? parseInt(row.clicks, 10) : Number(row.clicks ?? 0);
  const reach = typeof row.reach === "string" ? parseInt(row.reach, 10) : Number(row.reach ?? 0);
  const leads = typeof row.leads_count === "string" ? parseInt(row.leads_count, 10) : Number(row.leads_count ?? 0);
  const cpc = typeof row.cpc === "string" ? parseFloat(row.cpc) : Number(row.cpc ?? 0);
  const cpm = typeof row.cpm === "string" ? parseFloat(row.cpm) : Number(row.cpm ?? 0);
  const ctr = typeof row.ctr === "string" ? parseFloat(row.ctr) : Number(row.ctr ?? 0);
  const costPerLead = typeof row.cost_per_lead === "string" ? parseFloat(row.cost_per_lead) : Number(row.cost_per_lead ?? 0);

  return {
    workspace_id: row.workspace_id,
    provider: "meta_ads",
    ad_account_id: row.ad_account_id,
    period_start: row.date_start,
    period_end: row.date_stop,
    current_spend: spend,
    baseline_spend: baselineSpend,
    impressions,
    clicks,
    reach,
    leads,
    conversions: leads,
    cpc,
    cpm,
    ctr,
    cost_per_lead: costPerLead,
    is_known_account: true,
    is_known_campaign: true,
    auth_anomaly: connectionStatus === "error",
    token_anomaly: connectionStatus === "error",
    connection_anomaly: connectionStatus === "error",
    billing_signal: undefined, // Meta cache does not expose payment failure signals
    synced_at: row.synced_at,
  };
}

/**
 * Normalizes raw Google Ads cache record into provider-neutral telemetry.
 */
export function normalizeGoogleAdsTelemetry(
  row: RawGoogleAdsCacheRow,
  baselineSpend = 0,
  connectionStatus: "connected" | "disconnected" | "error" = "connected"
): NormalizedAdsTelemetry {
  const spend = typeof row.spend === "string" ? parseFloat(row.spend) : Number(row.spend ?? 0);
  const impressions = typeof row.impressions === "string" ? parseInt(row.impressions, 10) : Number(row.impressions ?? 0);
  const clicks = typeof row.clicks === "string" ? parseInt(row.clicks, 10) : Number(row.clicks ?? 0);
  const conversions = typeof row.conversions === "string" ? parseFloat(row.conversions) : Number(row.conversions ?? 0);
  const cpc = typeof row.cpc === "string" ? parseFloat(row.cpc) : Number(row.cpc ?? 0);
  const ctr = typeof row.ctr === "string" ? parseFloat(row.ctr) : Number(row.ctr ?? 0);
  const costPerConv = typeof row.cost_per_conv === "string" ? parseFloat(row.cost_per_conv) : Number(row.cost_per_conv ?? 0);

  return {
    workspace_id: row.workspace_id,
    provider: "google_ads",
    ad_account_id: row.customer_id,
    period_start: row.date_start,
    period_end: row.date_stop,
    current_spend: spend,
    baseline_spend: baselineSpend,
    impressions,
    clicks,
    conversions,
    cpc,
    ctr,
    cost_per_conversion: costPerConv,
    is_known_account: true,
    is_known_campaign: true,
    auth_anomaly: connectionStatus === "error",
    token_anomaly: connectionStatus === "error",
    connection_anomaly: connectionStatus === "error",
    billing_signal: undefined, // Google cache does not expose payment failure signals
    synced_at: row.synced_at,
  };
}
