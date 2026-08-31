import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260831025500_security_advisor_internal_trigger_rpc_boundary.sql"),
  "utf8",
);

describe("Security Advisor internal trigger RPC boundary", () => {
  it("revokes direct browser execution from internal trigger helpers", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.enforce_p0_5_a_parent_workspace()\n  FROM PUBLIC, anon, authenticated;");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.community_workspace_authorized(uuid, uuid)\n  FROM PUBLIC, anon, authenticated;");
  });

  it("preserves service-role execution", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.enforce_p0_5_a_parent_workspace()\n  TO service_role;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.community_workspace_authorized(uuid, uuid)\n  TO service_role;");
  });
});
