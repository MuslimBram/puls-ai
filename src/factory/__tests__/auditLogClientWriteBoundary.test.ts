import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829163500_audit_log_client_write_boundary.sql"),
  "utf8",
);
const auditHook = readFileSync(resolve(process.cwd(), "src/hooks/useAuditLog.ts"), "utf8");
const conversionHook = readFileSync(resolve(process.cwd(), "src/hooks/useConversionTracking.ts"), "utf8");

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

const directAuditInserts = sourceFiles(resolve(process.cwd(), "src")).filter((file) => {
  const source = readFileSync(file, "utf8");
  return /\.from\(\s*["']audit_logs["']\s*\)\s*\.\s*insert\s*\(/s.test(source);
});

describe("Audit log client write boundary", () => {
  it("removes every direct browser insert into audit_logs", () => {
    expect(directAuditInserts).toEqual([]);
    expect(auditHook).toContain('rpc("record_client_audit_event"');
    expect(conversionHook).toContain('rpc("record_client_audit_event"');
  });

  it("binds the actor to auth.uid and fails closed on unknown actions", () => {
    expect(migration).toContain("v_actor uuid := (select auth.uid())");
    expect(migration).toContain("raise exception 'Client audit action is not allowed'");
    expect(migration).toContain("v_meta := v_meta || jsonb_build_object('_source','client_rpc')");
  });

  it("retains all canonical conversion events", () => {
    for (const event of [
      "plan_page_view",
      "upgrade_click",
      "paywall_trigger",
      "trial_started",
      "trial_to_paid",
      "downgrade_click",
      "downgrade_reason",
      "referral_click",
      "referral_conversion",
      "feature_adoption",
      "workspace_expansion",
      "activation_milestone",
      "churn_recovery",
      "insight_view",
      "suggestion_accepted",
    ]) {
      expect(migration).toContain(`'conversion.${event}'`);
    }
  });

  it("requires owner authorization for workspace audit events", () => {
    expect(migration).toContain("'payment_mode_change','payment_accounts_update'");
    expect(migration).toContain("public.has_workspace_role(v_workspace, array['owner'])");
  });

  it("requires platform authorization for admin UI audit events", () => {
    expect(migration).toContain("'partner_approved','partner_rejected','payment_account_flagged'");
    expect(migration).toContain("'business_approved','business_rejected','business_needs_changes'");
    expect(migration).toContain("if not public.is_platform_operator() then");
  });

  it("removes browser audit mutation privileges", () => {
    expect(migration).toContain('drop policy if exists "authenticated_insert_own_audit_logs" on public.audit_logs');
    expect(migration).toContain("grant select on table public.audit_logs to authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.audit_logs to service_role");
  });

  const pgIt = process.env.CI === "true" ? it : it.skip;
  pgIt("passes the isolated PostgreSQL adversarial verifier", () => {
    execFileSync("bash", ["scripts/verify-audit-log-client-write-boundary.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      timeout: 120_000,
    });
  });
});
