import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260829150435_critical_rls_public_tenant_bypass_closure.sql");

describe("critical public/self-correlated RLS bypass closure", () => {
  it("drops every confirmed public auth.uid-null bypass", () => {
    for (const policy of [
      "service_manage_consent",
      "service_manage_conversions",
      "service_manage_ref_events",
      "service_manage_freq_log",
      "service_manage_trigger_log",
      "service_manage_nba",
      "service_only_webhooks",
      "service_manage_sessions",
    ]) {
      expect(migration).toContain(`drop policy if exists \"${policy}\"`);
    }
  });

  it("drops every confirmed self-correlated workspace policy", () => {
    for (const policy of [
      "workspace_manage_segments",
      "workspace_manage_ref_programs",
      "workspace_manage_triggers",
      "workspace_read_rules",
      "workspace_read_consent",
      "workspace_read_conversions",
      "workspace_read_ref_events",
      "workspace_read_nba",
    ]) {
      expect(migration).toContain(`drop policy if exists \"${policy}\"`);
    }
    expect(migration).toContain('drop policy if exists "admin_manage_rules"');
    expect(migration).toContain('drop policy if exists "workspace_read_sessions"');
  });

  it("replaces bypasses with canonical workspace helpers and no platform-role shortcut", () => {
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin','member'])");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin'])");
    expect(migration).not.toContain("create policy \"service_");
    expect(migration).not.toContain("create policy \"workspace_manage_");
    expect(migration).not.toContain("public.has_role(");
  });

  it("revokes anon/sandbox and limits service role to DML", () => {
    expect(migration).toContain("from public, anon, authenticated, sandbox_exec, service_role");
    expect(migration).toContain("to service_role;");
    expect(migration).not.toContain("grant all privileges");
  });

  it("keeps service-only operational logs out of browser access", () => {
    expect(migration).toContain("frequency_cap_log, lifecycle_trigger_log and processed_webhook_events deliberately");
    expect(migration).not.toContain("grant select on table public.frequency_cap_log to authenticated");
    expect(migration).not.toContain("grant select on table public.lifecycle_trigger_log to authenticated");
    expect(migration).not.toContain("grant select on table public.processed_webhook_events to authenticated");
  });

  it("executes the PostgreSQL adversarial verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-critical-rls-public-tenant-bypass-closure.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
