import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260829143530_p0_5_b3b_n8n_metadata_boundary.sql");

describe("P0.5-B3B n8n metadata tenant boundary", () => {
  it("keeps tenant and creator identity authoritative", () => {
    expect(migration).toContain("alter table public.n8n_configurations alter column workspace_id set not null");
    expect(migration).toContain("alter table public.n8n_configurations alter column user_id set not null");
    expect(migration).toContain("n8n_configurations workspace_id is immutable");
    expect(migration).toContain("n8n_configurations user_id is immutable");
    expect(migration).toContain("before update of workspace_id, user_id");
  });

  it("removes global platform-role bypass and limits access to workspace owner/admin", () => {
    expect(migration).toContain('drop policy if exists "Workspace owners manage n8n config"');
    expect(migration).toContain("array['owner','admin']");
    expect(migration).not.toContain("public.has_role(");
    expect(migration).not.toContain("'super_admin'::");
    expect(migration).toContain("and user_id = (select auth.uid())");
  });

  it("removes anon and sandbox access while retaining bounded DML", () => {
    expect(migration).toContain(
      "from public, anon, authenticated, sandbox_exec, service_role",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.n8n_configurations",
    );
    expect(migration).toContain("to authenticated, service_role");
  });

  it("uses an invoker identity trigger with a fixed search path", () => {
    expect(migration).toContain("create or replace function public.enforce_p0_5_b3b_n8n_identity_immutability()");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = pg_catalog");
  });

  it("executes the PostgreSQL negative-role verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-p0-5-b3b-n8n-metadata-boundary.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
