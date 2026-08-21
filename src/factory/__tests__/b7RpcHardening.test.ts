import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

describe("B7 RPC Security Hardening — claim_community_ai_request service_role-only", () => {
  describe("STATIC CONTRACT TESTS", () => {
    it("1. Verifies 20260821120000_b7_claim_rpc_service_role_only.sql revokes claim_community_ai_request from PUBLIC, anon, and authenticated and grants to service_role ONLY", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const migFile = files.find((f) => f.includes("b7_claim_rpc_service_role_only"));

      expect(migFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, migFile!), "utf-8");

      // Verify full REVOKE from PUBLIC, anon, AND authenticated
      expect(content).toContain(
        "REVOKE EXECUTE ON FUNCTION public.claim_community_ai_request FROM PUBLIC, anon, authenticated;"
      );

      // Verify GRANT to service_role ONLY (no authenticated grant)
      expect(content).toContain(
        "GRANT EXECUTE ON FUNCTION public.claim_community_ai_request TO service_role;"
      );

      // Confirm no authenticated grant in this migration
      expect(content).not.toContain("GRANT EXECUTE ON FUNCTION public.claim_community_ai_request TO authenticated");
    });

    it("2. Verifies bootstrap_user_account_for is NOT touched by the new ACL migration (super_admin self-healing preserved on main)", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const migFile = files.find((f) => f.includes("b7_claim_rpc_service_role_only"));

      expect(migFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, migFile!), "utf-8");

      // The targeted migration must not touch bootstrap_user_account_for
      expect(content).not.toContain("bootstrap_user_account_for");
    });
  });

  describe("UNIT SIMULATION TESTS", () => {
    it("1. Simulates claim_community_ai_request service_role guard, p_via validation, and idempotency 1-quota rule", () => {
      const quotaStore = new Map<string, unknown>();

      const claimRequestServiceRole = (
        callerRole: string,
        userId: string,
        module: string,
        requestId: string,
        via = "system"
      ) => {
        if (callerRole !== "service_role") {
          const err = new Error("Permission denied: service_role required");
          (err as Error & { code: string }).code = "42501";
          throw err;
        }

        if (!["system", "workspace"].includes(via)) {
          const err = new Error("Invalid via parameter: must be system or workspace");
          (err as Error & { code: string }).code = "22023";
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
      expect(() =>
        claimRequestServiceRole("service_role", "usr-1", "mod-1", "req-1", "invalid_via")
      ).toThrow("Invalid via parameter");

      // Service role, valid via -> PASS (first call reserves)
      const first = claimRequestServiceRole("service_role", "usr-1", "mod-1", "req-1", "system");
      // Idempotent duplicate -> reused
      const second = claimRequestServiceRole("service_role", "usr-1", "mod-1", "req-1", "system");

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(false);
      expect(second.reused).toBe(true);
      expect(quotaStore.size).toBe(1); // exactly 1 quota unit consumed
    });
  });

  describe("RUNTIME INTEGRATION — SKIPPED", () => {
    it.skip("Requires Docker / real test DB credentials in runner environment", () => {
      // Skipped until real test DB / staging credentials are available
    });
  });
});
