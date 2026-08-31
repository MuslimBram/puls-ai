import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const googleWorkspace = read("supabase/functions/google-workspace-sync/index.ts");
const vicidial = read("supabase/functions/vicidial-cdr-sync/index.ts");
const legacyGoogleAds = read("supabase/functions/google-ads-sync/index.ts");
const migration = read("supabase/migrations/20260831210309_phase_h_vicidial_call_idempotency.sql");

describe("Phase H external integration isolation", () => {
  it("binds Google Workspace credentials and actions to an authorized workspace", () => {
    expect(googleWorkspace).toContain('provider", "google_workspace"');
    expect(googleWorkspace).toContain('has_workspace_role_for_user');
    expect(googleWorkspace).toContain('_roles: ["owner", "admin"]');
    expect(googleWorkspace).toContain('credentials_encrypted');
    expect(googleWorkspace).toContain('decryptIfNeeded');
    expect(googleWorkspace).toContain('workspace_id is required');
    expect(googleWorkspace).toContain('sync_type: syncType');
    expect(googleWorkspace).not.toContain('Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")');
    expect(googleWorkspace).not.toContain('.from("appointments")');
  });

  it("uses tenant-scoped VICIdial connections and canonical call_records columns", () => {
    expect(vicidial).toContain('provider", "vicidial"');
    expect(vicidial).toContain('has_workspace_role_for_user');
    expect(vicidial).toContain('_roles: ["owner", "admin"]');
    expect(vicidial).toContain('credentials_encrypted');
    expect(vicidial).toContain('resolvePublicAddresses');
    expect(vicidial).toContain('external_call_id: externalCallId');
    expect(vicidial).toContain('channel_provider: "vicidial"');
    expect(vicidial).not.toContain('Deno.env.get("VICIDIAL_');
    expect(vicidial).not.toContain('vicidial_id');
    expect(vicidial).not.toContain('kpi_daily_snapshots');
  });

  it("makes the legacy Google Ads endpoint a thin proxy to the hardened canonical sync", () => {
    expect(legacyGoogleAds).toContain('/functions/v1/sync-google-ads');
    expect(legacyGoogleAds).toContain('X-Pulse-AI-Deprecated-Endpoint');
    expect(legacyGoogleAds).not.toContain('GOOGLE_ADS_CUSTOMER_ID');
    expect(legacyGoogleAds).not.toContain('GOOGLE_ADS_REFRESH_TOKEN');
    expect(legacyGoogleAds).not.toContain('getServiceKey');
    expect(legacyGoogleAds).not.toContain('.from("meta_ads_cache")');
  });

  it("enforces VICIdial replay protection within each workspace/provider boundary", () => {
    expect(migration).toMatch(/create unique index if not exists call_records_workspace_provider_external_call_uidx/i);
    expect(migration).toContain('(workspace_id, channel_provider, external_call_id)');
    expect(migration).toContain('where external_call_id is not null');
  });
});
