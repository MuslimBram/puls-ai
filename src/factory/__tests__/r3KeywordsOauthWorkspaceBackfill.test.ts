import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const migration = read("supabase", "migrations", "20260829192000_r3_keywords_oauth_workspace_backfill.sql");
const keywordsHook = read("src", "hooks", "useKeywords.ts");

describe("R3 keywords/oauth workspace backfill", () => {
  it("requires deterministic workspace attribution before enforcing NOT NULL", () => {
    expect(migration).toContain("count(DISTINCT c.workspace_id) <> 1");
    expect(migration).toContain("ALTER TABLE public.keywords ALTER COLUMN workspace_id SET NOT NULL");
    expect(migration).toContain("ALTER TABLE public.oauth_states ALTER COLUMN workspace_id SET NOT NULL");
  });

  it("keeps keywords caller + workspace bound and oauth_states backend-only", () => {
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_workspace_role(workspace_id, ARRAY['owner','admin','member'])");
    expect(migration).toContain('CREATE POLICY "Service role manages oauth states"');
    expect(migration).toContain("REVOKE ALL ON TABLE public.oauth_states FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_states TO service_role");
  });

  it("updates the live keyword hook to carry and scope the active workspace", () => {
    expect(keywordsHook).toContain('useWorkspace');
    expect(keywordsHook).toContain('workspace_id: workspace!.id');
    expect((keywordsHook.match(/\.eq\("workspace_id", workspace!\.id\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(keywordsHook).toContain('enabled: !!user && !!workspace');
  });

  it("runs the isolated PostgreSQL verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-r3-keywords-oauth-workspace-backfill.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
  });
});
