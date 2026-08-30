import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829173500_business_scan_history_legacy_boundary.sql"),
  "utf8",
);

describe("Business scan history legacy boundary", () => {
  it("preserves the known legacy orphan instead of deleting it", () => {
    expect(migration).toContain("5f8fbf39-982c-406f-bf76-51f639a6abfb");
    expect(migration).toContain("expected legacy orphan changed or disappeared");
    expect(migration).not.toMatch(/delete\s+from\s+public\.business_scan_history/i);
  });

  it("removes standing platform-role access and uses workspace policies", () => {
    expect(migration).toContain('drop policy if exists "Admins can manage all business scans"');
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_workspace_role(workspace_id,array['owner','admin','member'])");
    expect(migration).not.toMatch(/create policy[\s\S]{0,400}has_role\s*\(/i);
  });

  it("makes new business/workspace parent integrity fail closed", () => {
    expect(migration).toContain("additional orphan or workspace mismatch exists");
    expect(migration).toContain("business_scan_history business/workspace parent mismatch");
    expect(migration).toContain("before insert or update");
  });

  it("keeps browser identity immutable but leaves service-role repair possible", () => {
    expect(migration).toContain("tenant and creator identity are immutable");
    expect(migration).toContain("current_user not in ('postgres','service_role','supabase_admin')");
  });

  it("revokes broad browser grants and keeps browser delete closed", () => {
    expect(migration).toContain("from public,anon,authenticated,sandbox_exec,service_role");
    expect(migration).toContain("grant select,insert,update on table public.business_scan_history to authenticated");
    expect(migration).not.toContain("grant select,insert,update,delete on table public.business_scan_history to authenticated");
  });

  const pgIt = process.env.CI === "true" ? it : it.skip;
  pgIt("passes the isolated PostgreSQL adversarial verifier", () => {
    execFileSync("bash", ["scripts/verify-business-scan-history-legacy-boundary.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      timeout: 120_000,
    });
  });
});
