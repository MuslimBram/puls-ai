import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829162500_platform_governance_c1_c3.sql"),
  "utf8",
);
const approvalMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827160328_lock_ai_admin_review_to_service.sql"),
  "utf8",
);
const workspacePayment = readFileSync(resolve(process.cwd(), "src/hooks/useWorkspacePayment.ts"), "utf8");

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const runtimeFiles = [
  ...sourceFiles(resolve(process.cwd(), "src")),
  ...sourceFiles(resolve(process.cwd(), "supabase/functions")),
];

const directUserRoleWrites = runtimeFiles.filter((file) => {
  const source = readFileSync(file, "utf8");
  return /\.from\(\s*["']user_roles["']\s*\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/s.test(source);
});

describe("Platform governance C1/C3 source contract", () => {
  it("has no direct runtime writes to user_roles", () => {
    expect(directUserRoleWrites).toEqual([]);
  });

  it("preserves the SECURITY DEFINER admin approval grant path", () => {
    expect(approvalMigration).toMatch(/create or replace function public\.approve_admin_role[\s\S]*security definer/i);
    expect(approvalMigration).toContain("insert into public.user_roles(user_id, role)");
    expect(approvalMigration).toContain("grant execute on function public.approve_admin_role(uuid,text) to authenticated");
  });

  it("removes authenticated direct role grant and update policies", () => {
    expect(migration).toContain('drop policy if exists "Admins can manage roles" on public.user_roles');
    expect(migration).toContain('drop policy if exists "Admins can update roles" on public.user_roles');
    expect(migration).toContain("grant select, delete on table public.user_roles to authenticated");
    expect(migration).not.toContain("grant select, insert, update, delete on table public.user_roles to authenticated");
  });

  it("locks ordinary admin self-identity while preserving owner/backend repair", () => {
    expect(migration).toContain("create or replace function public.enforce_platform_admin_profile_identity()");
    expect(migration).toContain("old.user_id = _caller");
    expect(migration).toContain("public.has_role(_caller, 'admin'::public.app_role)");
    expect(migration).toContain("not public.has_role(_caller, 'super_admin'::public.app_role)");
    expect(migration).toContain("PLATFORM_ADMIN_IDENTITY_OWNER_MANAGED");
    expect(migration).toContain("before update of full_name");
  });

  it("protects only platform-managed workspace fields with no active tenant writer", () => {
    for (const column of [
      "billing_mode",
      "is_demo",
      "referred_by_partner_id",
      "workspace_owner_partner_id",
      "owner_id",
    ]) {
      expect(migration).toContain(`new.${column} is distinct from old.${column}`);
    }
    expect(migration).not.toContain("new.payment_mode is distinct from old.payment_mode");
    expect(migration).not.toContain("new.require_2fa is distinct from old.require_2fa");
    expect(migration).not.toContain("new.max_sessions_per_user is distinct from old.max_sessions_per_user");
    expect(migration).not.toContain("new.name is distinct from old.name");
  });

  it("documents and preserves the active owner payment-mode workflow", () => {
    expect(workspacePayment).toContain('.update({ payment_mode: mode } as any)');
    expect(migration).toContain("`payment_mode` is intentionally excluded here");
  });

  it("uses invoker triggers with fixed search_path and trusted backend escapes", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("current_user not in ('postgres', 'service_role', 'supabase_admin')");
  });

  const pgIt = process.env.CI === "true" ? it : it.skip;
  pgIt("passes the isolated PostgreSQL adversarial verifier", () => {
    execFileSync("bash", ["scripts/verify-platform-governance-c1-c3.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      timeout: 120_000,
    });
  });
});
