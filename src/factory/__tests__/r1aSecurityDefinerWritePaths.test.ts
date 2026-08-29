import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829183000_r1a_security_definer_write_paths.sql"),
  "utf8",
);
const callScripts = readFileSync(
  resolve(process.cwd(), "src/hooks/useCallScripts.ts"),
  "utf8",
);

const verifier = resolve(process.cwd(), "scripts/verify-r1a-security-definer-write-paths.sh");

describe("R1A SECURITY DEFINER write-path hardening", () => {
  it("makes the caller-controlled media and memory helpers backend-only", () => {
    for (const identity of [
      "public.consume_media_quota(uuid,uuid,text,integer,integer)",
      "public.consume_media_quota(uuid,uuid,text,integer,integer,integer,integer)",
      "public.ensure_media_daily_usage(uuid,uuid,integer,integer)",
      "public.ensure_media_daily_usage(uuid,uuid,integer,integer,integer)",
      "public.boost_memory_confidence(uuid,text,numeric)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${identity}`);
      expect(migration).toContain("FROM PUBLIC, anon, authenticated");
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${identity}`);
    }
  });

  it("binds script usage to the script's own workspace before mutation", () => {
    expect(migration).toContain("SELECT cs.workspace_id");
    expect(migration).toContain("public.has_workspace_role(_workspace_id, ARRAY['owner','admin','member'])");
    expect(migration).toContain("AND workspace_id = _workspace_id");
  });

  it("binds round-robin assignment to the actual thread workspace and scoped load counts", () => {
    expect(migration).toContain("_thread_workspace_id <> _workspace_id");
    expect(migration).toContain("THREAD_WORKSPACE_MISMATCH");
    expect(migration).toContain("ct.workspace_id = _workspace_id");
    expect(migration).toContain("public.has_workspace_role(_workspace_id, ARRAY['owner','admin','member'])");
  });

  it("uses the canonical increment_usage_count argument name and workspace-bounds the fallback", () => {
    expect(callScripts).toContain('{ _script_id: id }');
    expect(callScripts).not.toContain('{ script_id: id }');
    const fallback = callScripts.slice(callScripts.indexOf("// Fallback remains workspace-bound"));
    expect(fallback).toContain('.eq("id", id)');
    expect(fallback).toContain('.eq("workspace_id", workspace!.id)');
  });

  it("runs the isolated PostgreSQL adversarial verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", [verifier], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
  });
});
