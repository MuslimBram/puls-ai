import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260829184200_r1b_critical_write_boundaries.sql"),
  "utf8",
);
const verifier = readFileSync(
  join(root, "scripts/verify-r1b-critical-write-boundaries.sh"),
  "utf8",
);

describe("R1B critical SECURITY DEFINER write boundaries", () => {
  it("makes infrastructure write RPCs backend-only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.check_rate_limit(text,uuid,text,integer,integer,integer) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.compute_thread_sla(uuid,uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,uuid,text,integer,integer,integer) TO service_role",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.compute_thread_sla(uuid,uuid) TO service_role",
    );
  });

  it("scopes rate-limit bucket identity by workspace", () => {
    expect(migration).toContain("UNIQUE NULLS NOT DISTINCT (workspace_id, bucket_key)");
    expect(migration).toContain("workspace_id IS NOT DISTINCT FROM _workspace_id");
    expect(migration).toContain(
      "ON CONFLICT ON CONSTRAINT rate_limit_buckets_workspace_bucket_key_key DO NOTHING",
    );
  });

  it("binds SLA writes to the thread's real workspace", () => {
    expect(migration).toContain("_thread.workspace_id IS DISTINCT FROM _workspace_id");
    expect(migration).toContain("THREAD_WORKSPACE_MISMATCH");
    expect(migration).toContain("AND workspace_id = _workspace_id");
  });

  it("uses an isolated PostgreSQL adversarial verifier in CI", () => {
    expect(verifier).toContain("same bucket key did not remain workspace-isolated");
    expect(verifier).toContain("expected thread/workspace mismatch denial");
    expect(verifier).toContain("authenticated still executes R1B critical write RPCs");

    if (process.env.CI === "true") {
      execFileSync("bash", ["scripts/verify-r1b-critical-write-boundaries.sh"], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      });
    }
  });
});
