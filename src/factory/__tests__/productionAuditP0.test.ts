import { describe, it, expect } from "vitest";
import { runProductionAudit, runLiveDbAudit } from "../../../scripts/production-audit";

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
    expect(audit.unverifiedFunctions).toContain("stripe-webhook");
  });

  it("C. Live DB Catalog Audit: Verifies 100% of public tables have RLS enabled (rowsecurity = true)", async () => {
    const token = "REDACTED_SBP_TOKEN";
    const projectRef = "wlvlgghqwwhhqaqqopml";

    const audit = await runLiveDbAudit(token, projectRef);
    expect(audit.tables.length).toBeGreaterThan(100);
    expect(audit.unprotectedTables).toEqual([]);
  });
});
