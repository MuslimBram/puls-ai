import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260829190000_r1b_unowned_read_rpcs.sql"),
  "utf8",
);

const identities = [
  "get_media_usage_policy_for_user(uuid)",
  "is_contact_suppressed(uuid,text,text)",
  "check_freelancer_discount_eligibility(uuid)",
  "generate_daily_kpi(uuid)",
] as const;

describe("R1B unowned SECURITY DEFINER read RPC boundary", () => {
  it("makes all four no-runtime-caller RPCs service-role-only", () => {
    for (const identity of identities) {
      expect(migration).toContain(`public.${identity}`);
    }
    expect((migration.match(/FROM PUBLIC, anon, authenticated/g) ?? []).length).toBe(4);
    expect((migration.match(/TO service_role/g) ?? []).length).toBe(4);
  });

  it("sets safe search paths and corrects generate_daily_kpi volatility", () => {
    expect((migration.match(/SET search_path TO 'pg_catalog', 'public'/g) ?? []).length).toBe(4);
    expect(migration).toContain("ALTER FUNCTION public.generate_daily_kpi(uuid) STABLE");
  });

  it("runs the isolated PostgreSQL verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-r1b-unowned-read-rpcs.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
  });
});
