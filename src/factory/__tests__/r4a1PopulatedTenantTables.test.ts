import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const migration = read("supabase", "migrations", "20260829193000_r4a1_populated_tenant_tables.sql");
const marketing = read("src", "hooks", "useMarketingAutomation.ts");
const demand = read("src", "hooks", "useDemandForecasting.ts");
const personalization = read("src", "hooks", "usePersonalizationEngine.ts");
const churnAdmin = read("src", "components", "AdminChurnRiskPanel.tsx");
const ingestWebsite = read("supabase", "functions", "ingest-website", "index.ts");

describe("R4a1 populated tenant hardening", () => {
  it("makes all nine populated tenant workspace columns non-null and removes anon access", () => {
    for (const table of [
      "market_trends", "analytics_daily_snapshots", "automation_workflows", "knowledge_sources",
      "marketing_campaigns", "business_notifications", "demand_forecasts",
      "resource_planning_items", "personalization_rules",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ALTER COLUMN workspace_id SET NOT NULL`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon`);
    }
  });

  it("prevents workspace movement and cross-author member updates", () => {
    expect(migration).toContain("Workspace authors or admins can update");
    expect(migration).toContain("user_id=(SELECT auth.uid())");
    expect(migration).toContain("public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin''])");
    expect(migration).toContain("public.has_workspace_role(workspace_id, ARRAY[''member''])");
  });

  it("guards knowledge source parent/workspace equality", () => {
    expect(migration).toContain("enforce_r4a1_knowledge_parent_workspace");
    expect(migration).toContain("bp.workspace_id=NEW.workspace_id");
    expect(ingestWebsite).toContain("workspace_id: business.workspace_id");
  });

  it("requires active workspace on mutable browser callers", () => {
    expect(marketing).toContain('if (!user?.id || !workspace?.id) throw new Error("Workspace is required")');
    expect(marketing).toContain('.eq("workspace_id", workspace!.id)');
    expect(demand).toContain('if (!uid || !wid) throw new Error("Workspace is required")');
    expect(demand).toContain("workspace_id: wid");
    expect(personalization).toContain('if (!uid || !wid) throw new Error("Workspace is required")');
    expect(personalization).toContain('.eq("workspace_id", wid)');
    expect(churnAdmin).toContain("workspace_id: workspaceId");
    expect(churnAdmin).toContain("workspaceId: risk.workspace_id");
  });

  it("runs the isolated PostgreSQL verifier in CI", () => {
    if (process.env.CI !== "true") return;
    execFileSync("bash", ["scripts/verify-r4a1-populated-tenant-tables.sh"], {
      cwd: process.cwd(), stdio: "inherit", env: process.env,
    });
  });
});
