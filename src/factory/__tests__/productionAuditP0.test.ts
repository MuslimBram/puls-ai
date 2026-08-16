import { describe, it, expect } from "vitest";
import { runProductionAudit, runLiveDbAudit } from "../../../scripts/production-audit";

/**
 * P0 & B7: Production Security Audit & Live DB Catalog Verification
 *
 * Test C (Live DB Audit) requires SUPABASE_MGMT_TOKEN env var.
 * This must be a Supabase Management Access Token (sbp_...) provided via CI secret.
 * NEVER hardcode Management Tokens in source — they carry admin API access.
 *
 * In CI: set SUPABASE_MGMT_TOKEN as a GitHub Actions secret.
 * Locally: export SUPABASE_MGMT_TOKEN=sbp_... (never commit .env with this value)
 */
describe("P0 & B7: Production Security Audit & Live DB Catalog Verification", () => {
  it("A. Client-side src/ code contains 0 unsafe service_role key usages", () => {
    const rootDir = process.cwd();
    const audit = runProductionAudit(rootDir);
    expect(audit.unsafeServiceRoleUsage).toEqual([]);
  });

  it("B. Discovers all Edge Functions configured with verify_jwt=false", () => {
    const rootDir = process.cwd();
    const audit = runProductionAudit(rootDir);
    expect(Array.isArray(audit.unverifiedFunctions)).toBe(true);
    // Spot check known unverified functions like webhook handlers
    expect(audit.unverifiedFunctions).toContain("stripe-webhook");
  });

  it("C. Live DB Catalog Audit: Verifies 100% of public tables have RLS enabled", async () => {
    const token = process.env.SUPABASE_MGMT_TOKEN;
    const projectRef = "wlvlgghqwwhhqaqqopml";

    if (!token) {
      console.warn("SKIP C: SUPABASE_MGMT_TOKEN env var not set — provide via CI secret, never hardcode");
      return;
    }

    const audit = await runLiveDbAudit(token, projectRef);
    expect(audit.tables.length).toBeGreaterThan(100);
    expect(audit.unprotectedTables).toEqual([]);
  });
});
