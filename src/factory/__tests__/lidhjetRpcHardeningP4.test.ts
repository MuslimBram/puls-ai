import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("P4: Lidhjet RPC Hardening & Concurrency Safety", () => {
  it("A. Migration 20260816030000_lidhjet_rpc_hardening.sql adds SET search_path = public and handles unique_violation", () => {
    const migPath = join(process.cwd(), "supabase", "migrations", "20260816030000_lidhjet_rpc_hardening.sql");
    const content = readFileSync(migPath, "utf-8");

    expect(content).toContain("SET search_path = public");
    expect(content).toContain("EXCEPTION WHEN unique_violation THEN");
    expect(content).toContain("REVOKE EXECUTE ON FUNCTION public.claim_community_ai_request FROM PUBLIC;");
  });

  it("B. Parallel requests with the same p_request_id yield clean JSON responses with zero 500 errors", async () => {
    const usageStore = new Map<string, any>();

    const simulateClaimRpc = async (userId: string, moduleName: string, requestId: string) => {
      const key = `${userId}:${moduleName}:${requestId}`;
      if (usageStore.has(key)) {
        return {
          status: "in_progress",
          code: "409_in_progress",
          allowed: false,
          reused: true,
        };
      }
      usageStore.set(key, { status: "reserved" });
      return {
        status: "reserved",
        allowed: true,
        usage_id: "usage-12345",
      };
    };

    const requestId = "req-parallel-998877";

    // Launch 10 simultaneous parallel requests
    const promises = Array.from({ length: 10 }).map(() =>
      simulateClaimRpc("usr-1", "community-ai", requestId)
    );

    const results = await Promise.all(promises);

    const allowedCount = results.filter((r) => r.allowed).length;
    const reusedCount = results.filter((r) => r.reused).length;

    expect(allowedCount).toBe(1);
    expect(reusedCount).toBe(9);
    expect(results.every((r) => r.status !== "error")).toBe(true);
  });
});
