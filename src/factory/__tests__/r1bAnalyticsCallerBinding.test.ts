import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const migration = read("supabase", "migrations", "20260829185000_r1b_analytics_caller_binding.sql");
const hook = read("src", "hooks", "useOperationalIntelligence.ts");

const analyticsFunctions = [
  "compute_agent_performance",
  "compute_ai_metrics",
  "compute_channel_performance",
  "compute_funnel_analytics",
  "compute_executive_summary",
] as const;

describe("R1B operational analytics caller binding", () => {
  it("keeps the five browser analytics RPCs caller-bound with service-role escape only", () => {
    for (const fn of analyticsFunctions) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
    expect((migration.match(/ANALYTICS_SUBJECT_FORBIDDEN/g) ?? []).length).toBe(5);
    expect((migration.match(/request\.jwt\.claim\.role/g) ?? []).length).toBe(5);
    expect((migration.match(/auth\.uid\(\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain("TO authenticated, service_role");
    expect(migration).toContain("FROM PUBLIC, anon");
  });

  it("preserves the current frontend contract: every RPC passes the signed-in user id", () => {
    for (const fn of analyticsFunctions) {
      const start = hook.indexOf(`supabase.rpc(\"${fn}\"`);
      expect(start, `${fn} caller missing`).toBeGreaterThan(-1);
      const callerWindow = hook.slice(start, start + 260);
      expect(callerWindow).toContain("_user_id: user!.id");
    }
  });

  it("keeps safe explicit search paths on all five SECURITY DEFINER functions", () => {
    expect((migration.match(/SET search_path TO 'pg_catalog', 'public'/g) ?? []).length).toBe(5);
  });

  it("runs the isolated PostgreSQL adversarial verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-r1b-analytics-caller-binding.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
  });
});
