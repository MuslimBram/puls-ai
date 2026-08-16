import { describe, it, expect } from "vitest";
import { runProductionAudit } from "../../../scripts/production-audit";
import { join } from "path";

describe("P0: Production Security Audit", () => {
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
});
