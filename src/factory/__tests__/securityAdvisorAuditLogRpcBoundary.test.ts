import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260831012500_security_advisor_log_audit_boundary.sql"),
  "utf8",
);

describe("Security Advisor legacy audit RPC boundary", () => {
  it("removes browser execution from the arbitrary-subject audit writer", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("preserves explicit backend execution only", () => {
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.log_audit(uuid, uuid, text, text, text, jsonb)",
    );
    expect(migration).toContain("TO service_role;");
  });

  it("documents forged-audit prevention", () => {
    expect(migration).toContain("prevent forged actor/action/metadata audit entries");
  });
});
