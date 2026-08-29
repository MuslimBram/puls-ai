import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829161000_registered_assets_platform_bypass_closure.sql"),
  "utf8",
);

describe("registered_assets platform bypass closure", () => {
  it("removes standing platform/business-owner bypasses", () => {
    expect(migration).toContain('drop policy if exists "Admins can update assets"');
    expect(migration).toContain('drop policy if exists "Workspace members can view assets"');
    expect(migration).toContain('drop policy if exists "Authenticated users can register assets"');
    expect(migration).not.toContain("public.has_role(");
    expect(migration).not.toContain("business_owner");
    expect(migration).not.toContain("super_admin");
  });

  it("uses canonical workspace authorization for read/write", () => {
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("registered_by = (select auth.uid())");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin','member'])");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin'])");
  });

  it("makes tenant and creator identity immutable", () => {
    expect(migration).toContain("registered_assets workspace_id is immutable");
    expect(migration).toContain("registered_assets registered_by is immutable");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = pg_catalog");
  });

  it("uses least-privilege table ACLs", () => {
    expect(migration).toContain("from public, anon, authenticated, sandbox_exec, service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.registered_assets");
    expect(migration).toContain("to authenticated, service_role");
  });

  it("executes the PostgreSQL adversarial verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-registered-assets-platform-bypass-closure.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
