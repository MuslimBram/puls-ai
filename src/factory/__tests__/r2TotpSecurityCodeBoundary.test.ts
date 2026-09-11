import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const migration = read("supabase", "migrations", "20260829191000_r2_totp_security_code_boundary.sql");
const totpManage = read("supabase", "functions", "totp-manage", "index.ts");
const useTotp = read("src", "hooks", "useTOTP.ts");

describe("R2 TOTP and security-code storage boundary", () => {
  it("removes browser policies and grants from both legacy security stores", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Users manage own TOTP"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Users manage own security code"');
    expect((migration.match(/FROM PUBLIC, anon, authenticated, service_role/g) ?? []).length).toBe(2);
    expect((migration.match(/TO service_role/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("preserves only service-role CRUD and keeps RLS enabled", () => {
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.totp_secrets TO service_role");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_security_codes TO service_role");
    expect(migration).toContain("ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.user_security_codes ENABLE ROW LEVEL SECURITY");
  });

  it("keeps the real customer TOTP flow on Supabase Auth MFA rather than legacy tables", () => {
    expect(totpManage).toContain("auth.mfa.enroll");
    expect(totpManage).toContain("auth.mfa.challenge");
    expect(totpManage).toContain("auth.mfa.verify");
    expect(totpManage).toContain("auth.mfa.unenroll");
    expect(totpManage).not.toContain('from("totp_secrets")');
    expect(totpManage).not.toContain('from("user_security_codes")');
    expect(useTotp).toContain("auth.mfa.enroll");
    expect(useTotp).toContain("auth.mfa.challenge");
    expect(useTotp).toContain("auth.mfa.verify");
    expect(useTotp).toContain("auth.mfa.unenroll");
    expect(useTotp).not.toContain('functions.invoke("totp-manage"');
    expect(useTotp).not.toContain('from("totp_secrets")');
  });

  it("runs the isolated PostgreSQL adversarial verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-r2-totp-security-code-boundary.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
  });
});
