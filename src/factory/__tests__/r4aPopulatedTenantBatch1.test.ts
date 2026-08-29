import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const migration = read("supabase", "migrations", "20260829193000_r4a_populated_tenant_batch_1.sql");
const genericHooks = read("src", "hooks", "useSupabaseQuery.ts");
const competitors = read("src", "hooks", "useCompetitors.ts");
const ops = read("src", "hooks", "useOperationalIntelligence.ts");
const publicApi = read("supabase", "functions", "public-api", "index.ts");

const tables = ["competitors", "competitor_alerts", "market_trends", "analytics_daily_snapshots", "automation_workflows"];

describe("R4a populated tenant batch 1", () => {
  it("enforces non-null workspace and workspace-aware RLS on all five tables", () => {
    for (const table of tables) {
      expect(migration).toContain(`ALTER TABLE public.${table} ALTER COLUMN workspace_id SET NOT NULL`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon`);
    }
    expect(migration).toContain("has_workspace_access(workspace_id)");
    expect(migration).toContain("has_workspace_role(workspace_id,ARRAY['owner','admin','member'])");
    expect(migration).toContain("has_workspace_role(workspace_id,ARRAY['owner','admin'])");
  });

  it("adds competitor parent-workspace equality enforcement", () => {
    expect(migration).toContain("enforce_r4a_competitor_alert_workspace");
    expect(migration).toContain("COMPETITOR_ALERT_WORKSPACE_MISMATCH");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF competitor_id, workspace_id");
  });

  it("keeps generic hooks backward-compatible and opts competitor intelligence into workspace scoping", () => {
    expect(genericHooks).toContain("workspaceScoped?: boolean");
    expect(genericHooks).toContain('.eq("workspace_id", workspace!.id)');
    expect(competitors).toContain('workspaceScoped: true');
    expect(competitors).toContain('.eq("workspace_id", workspace.id)');
  });

  it("scopes historical snapshots and API automation reads to workspace", () => {
    expect(ops).toContain('["ops-snapshots", user?.id, workspace?.id, days]');
    expect(ops).toContain('.eq("workspace_id", workspace!.id)');
    const automations = publicApi.slice(publicApi.indexOf('case "automations"'), publicApi.indexOf('case "analytics"'));
    expect(automations).toContain('.eq("workspace_id", workspace_id)');
  });

  it("runs the isolated PostgreSQL adversarial verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-r4a-populated-tenant-batch-1.sh"], { cwd: process.cwd(), stdio: "inherit", env: process.env });
  });
});
