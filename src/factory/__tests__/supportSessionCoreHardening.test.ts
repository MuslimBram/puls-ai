import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829170500_support_session_core_hardening.sql"),
  "utf8",
);

describe("Support session core hardening", () => {
  it("retires secrets and constrains stored scopes", () => {
    expect(migration).toContain("workspace_support_sessions_scopes_allowed_check");
    expect(migration).toContain("array['metadata','messages','files','customer_data']::text[]");
    expect(migration).not.toMatch(/not in \('metadata','messages','files','customer_data','secrets'\)/i);
  });

  it("rechecks platform operator status on every scoped access", () => {
    expect(migration).toMatch(/create or replace function public\.has_active_support_scope[\s\S]*public\.is_platform_operator\(\)/i);
    expect(migration).toContain("s.revoked_at is null");
    expect(migration).toContain("s.expires_at>pg_catalog.now()");
  });

  it("allows workspace owner or platform operator revocation without creator binding", () => {
    const revokeBody = migration.match(/create or replace function public\.revoke_workspace_support_session[\s\S]*?\n\$\$;/i)?.[0] ?? "";
    expect(revokeBody).toContain("public.is_workspace_owner((select auth.uid()),v_workspace)");
    expect(revokeBody).toContain("public.is_platform_operator()");
    expect(revokeBody).not.toContain("support_user_id=(select auth.uid())");
  });

  it("gives tenant owners visibility while keeping browser mutation closed", () => {
    expect(migration).toContain('create policy "p1_support_sessions_select_authorized"');
    expect(migration).toContain("public.is_workspace_owner((select auth.uid()),workspace_id)");
    expect(migration).toContain("grant select on table public.workspace_support_sessions to authenticated");
    expect(migration).not.toContain("grant select,insert,update,delete on table public.workspace_support_sessions to authenticated");
  });

  it("uses fixed search_path SECURITY DEFINER RPCs", () => {
    expect((migration.match(/security definer/gi) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((migration.match(/set search_path = ''/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  const pgIt = process.env.CI === "true" ? it : it.skip;
  pgIt("passes the isolated PostgreSQL adversarial verifier", () => {
    execFileSync("bash", ["scripts/verify-support-session-core-hardening.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      timeout: 120_000,
    });
  });
});
