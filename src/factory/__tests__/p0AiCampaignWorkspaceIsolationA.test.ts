import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260829124500_p0_5_a_ai_campaign_workspace_isolation.sql");
const dedicatedAi = read("src/pages/DedicatedAI.tsx");
const marketing = read("src/hooks/useMarketingAutomation.ts");
const analytics = read("src/hooks/useDeepAnalytics.ts");

describe("P0.5-A AI and campaign workspace isolation", () => {
  it("makes workspace identity authoritative on all four tables", () => {
    for (const table of ["ai_conversations", "ai_content_library", "campaigns", "campaign_content"]) {
      expect(migration).toContain(`alter table public.${table} alter column workspace_id set not null`);
    }
    expect(migration).toContain("workspace_id is immutable");
    expect(migration).toContain("user_id is immutable");
    expect(migration).toContain("before update of workspace_id, user_id");
  });

  it("replaces user-only RLS with workspace read/write/delete roles", () => {
    expect(migration).toContain("using (public.has_workspace_access(workspace_id))");
    expect(migration).toContain("array['owner','admin','member']");
    expect(migration).toContain("array['owner','admin']");
    expect(migration).toContain("and user_id = (select auth.uid())");
    expect(migration).not.toContain("platform admin");
    expect(migration).not.toContain("super_admin')");
  });

  it("validates child parents without depending on parent browser RLS", () => {
    expect(migration).toContain("create or replace function public.enforce_p0_5_a_parent_workspace()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("campaign_content campaign workspace mismatch");
    expect(migration).toContain("campaign_content content post workspace mismatch");
    expect(migration).toContain("ai_conversations business workspace mismatch");
  });

  it("removes broad browser grants while preserving authenticated and service DML", () => {
    for (const table of ["ai_conversations", "ai_content_library", "campaigns", "campaign_content"]) {
      expect(migration).toContain(
        `revoke all privileges on table public.${table} from public, anon, authenticated, sandbox_exec, service_role`,
      );
      expect(migration).toContain(
        `grant select, insert, update, delete on table public.${table} to authenticated, service_role`,
      );
    }
  });

  it("uses the active workspace in browser callers", () => {
    expect(dedicatedAi).toContain('queryKey: ["ai-conversations", workspace?.id]');
    expect(dedicatedAi).toContain('.eq("workspace_id", workspace!.id)');
    expect(dedicatedAi).toContain('.eq("workspace_id", workspace.id)');

    expect(marketing).toContain('queryKey: ["content-library", workspace?.id]');
    expect(marketing).toContain('.from("ai_content_library")');
    expect(marketing).toContain('.eq("workspace_id", workspace!.id)');
    expect(marketing).toContain('workspace_id: workspace.id');

    expect(analytics).toContain('queryKey: ["deep-analytics-ai", workspace?.id, dateRange]');
    expect(analytics).toContain('.from("ai_conversations")');
    expect(analytics).toContain('.eq("workspace_id", workspace!.id)');
  });

  it("executes the PostgreSQL negative-role verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-p0-5-a-ai-campaign-workspace-isolation.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
    });
  });
});
