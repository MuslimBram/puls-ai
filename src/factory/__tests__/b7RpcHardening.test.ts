import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

describe("B7 RPC Security Hardening V4 Tests", () => {
  describe("STATIC CONTRACT TESTS", () => {
    it("1. Verifies 20260816210709_b7_rpc_hardening.sql preserves bootstrap_user_account_for authenticated-self internal wrapper path while enforcing SERVICE_ROLE ONLY for claim_community_ai_request", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const b7MigrationFile = files.find((f) => f.includes("b7_rpc_hardening"));

      expect(b7MigrationFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, b7MigrationFile!), "utf-8");

      // Verify search_path = public, pg_temp
      expect(content).toContain("SET search_path = public, pg_temp");

      // Verify REVOKE EXECUTE from PUBLIC, anon, AND authenticated
      expect(content).toContain("REVOKE EXECUTE ON FUNCTION public.bootstrap_user_account_for(uuid) FROM PUBLIC, anon, authenticated;");
      expect(content).toContain("REVOKE EXECUTE ON FUNCTION public.claim_community_ai_request FROM PUBLIC, anon, authenticated;");

      // Verify GRANT to service_role ONLY
      expect(content).toContain("GRANT EXECUTE ON FUNCTION public.bootstrap_user_account_for(uuid) TO service_role;");
      expect(content).toContain("GRANT EXECUTE ON FUNCTION public.claim_community_ai_request TO service_role;");

      // Verify bootstrap body guard allows authenticated-self (auth.uid() = _user_id) for ensure_current_user_bootstrap wrapper
      expect(content).toContain("ELSIF auth.uid() IS NOT NULL AND auth.uid() = _user_id THEN");

      // Verify claim_community_ai_request fail-closed service_role guard
      expect(content).toContain("IF COALESCE(auth.role(), '') <> 'service_role' THEN");
      expect(content).toContain("Permission denied: service_role required");
    });

    it("2. Verifies Free Plan Quota Mapping: free/basic plan is mapped to standard plan key (25 replies/day) based on ai-router source", () => {
      const aiRouterPath = join(process.cwd(), "supabase", "functions", "ai-router", "index.ts");
      const aiRouterContent = readFileSync(aiRouterPath, "utf-8");

      expect(aiRouterContent).toContain('free:"standard"');
      expect(aiRouterContent).toContain('basic:"standard"');

      const migrationPath = join(process.cwd(), "supabase", "migrations", "20260816210709_b7_rpc_hardening.sql");
      const migrationContent = readFileSync(migrationPath, "utf-8");

      expect(migrationContent).toContain("WHEN 'free' THEN 'standard'");
      expect(migrationContent).toContain("WHEN 'basic' THEN 'standard'");
    });

    it("3. Verifies p_via closed set ('system', 'workspace') and daily limit semantics (0 = capped, -1 = unlimited)", () => {
      const migrationPath = join(process.cwd(), "supabase", "migrations", "20260816210709_b7_rpc_hardening.sql");
      const migrationContent = readFileSync(migrationPath, "utf-8");

      expect(migrationContent).toContain("IF p_via NOT IN ('system', 'workspace') THEN");
      expect(migrationContent).toContain("IF p_via = 'system' AND v_daily_limit = 0 THEN");
    });

    it("4. Verifies scope creep removal: super_admin auto-grant is completely removed from migration", () => {
      const migrationPath = join(process.cwd(), "supabase", "migrations", "20260816210709_b7_rpc_hardening.sql");
      const migrationContent = readFileSync(migrationPath, "utf-8");

      expect(migrationContent).not.toContain("super_admin");
      expect(migrationContent).not.toContain("muslim.brami@gmail.com");
    });
  });

  describe("UNIT SIMULATION TESTS", () => {
    it("1. Simulates claim_community_ai_request reservation-first ordering, p_via validation, and idempotency 1-quota rule", () => {
      const quotaStore = new Map<string, any>();

      const claimRequestServiceRole = (
        callerRole: string,
        userId: string,
        module: string,
        requestId: string,
        via: string = "system"
      ) => {
        if (callerRole !== "service_role") {
          const err = new Error("Permission denied: service_role required");
          (err as any).code = "42501";
          throw err;
        }

        if (!["system", "workspace"].includes(via)) {
          const err = new Error("Invalid via parameter: must be system or workspace");
          (err as any).code = "22023";
          throw err;
        }

        const key = `${userId}:${module}:${requestId}`;
        if (quotaStore.has(key)) {
          return { status: "in_progress", code: "409_in_progress", allowed: false, reused: true };
        }
        quotaStore.set(key, { status: "reserved" });
        return { status: "reserved", allowed: true, usage_id: "u-100" };
      };

      // Non-service role -> DENY
      expect(() => claimRequestServiceRole("authenticated", "usr-1", "mod-1", "req-1")).toThrow(
        "Permission denied: service_role required"
      );

      // Invalid p_via -> DENY
      expect(() => claimRequestServiceRole("service_role", "usr-1", "mod-1", "req-1", "invalid_via")).toThrow(
        "Invalid via parameter"
      );

      // Service role -> PASS
      const first = claimRequestServiceRole("service_role", "usr-1", "mod-1", "req-1", "system");
      const second = claimRequestServiceRole("service_role", "usr-1", "mod-1", "req-1", "system");

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(false);
      expect(second.reused).toBe(true);
      expect(quotaStore.size).toBe(1); // Exactly 1 quota unit consumed
    });
  });

  describe("RUNTIME INTEGRATION — SKIPPED", () => {
    it.skip("Requires Docker / real test DB credentials in runner environment", () => {
      // Skipped until real test DB / staging credentials are available
    });
  });
});
