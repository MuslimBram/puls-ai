import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260831013500_security_advisor_helper_rpc_boundaries.sql"),
  "utf8",
);

describe("Security Advisor helper RPC boundaries", () => {
  it("binds browser storage-quota checks to workspace access", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.check_storage_quota");
    expect(migration).toContain("NOT public.has_workspace_access(_workspace_id)");
    expect(migration).toContain("FORBIDDEN: workspace access required");
  });

  it("moves unused explicit-subject helper RPCs behind service_role", () => {
    const signatures = [
      "public.check_freelancer_relation_eligibility(uuid, uuid, text)",
      "public.evaluate_contact_policy(uuid, uuid, text, text)",
      "public.get_active_referral_count(uuid)",
      "public.validate_nba_against_rules(uuid, text, numeric, text, uuid)",
    ];

    for (const signature of signatures) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
    }

    expect(migration.match(/FROM PUBLIC, anon, authenticated;/g)?.length).toBe(4);
    expect(migration.match(/TO service_role;/g)?.length).toBe(4);
  });
});
