import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260831001500_security_advisor_explicit_user_rpc_boundary.sql"),
  "utf8",
);

describe("Security Advisor explicit-user RPC boundary", () => {
  it("removes browser execution from legacy arbitrary-user business helpers", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.check_business_creation_limit(uuid)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.check_channel_business_ownership(uuid, uuid)");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("preserves backend service execution", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.check_business_creation_limit(uuid)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.check_channel_business_ownership(uuid, uuid)");
    expect(migration.match(/TO service_role;/g)?.length).toBe(2);
  });

  it("documents the user-spoofing boundary", () => {
    expect(migration).toContain("arbitrary-user subject spoofing");
    expect(migration).toContain("Backend-only legacy explicit-user");
  });
});
