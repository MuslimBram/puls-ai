import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read=(...p:string[])=>readFileSync(join(process.cwd(),...p),"utf8");
const migration=read("supabase","migrations","20260829194000_r4a2_competitor_tenant_boundary.sql");
const hooks=read("src","hooks","useCompetitors.ts");
const generic=read("src","hooks","useSupabaseQuery.ts");
describe("R4a2 competitor tenant boundary",()=>{
 it("hardens only competitors and alerts with parent equality",()=>{ expect(migration).toContain("ALTER TABLE public.competitors ALTER COLUMN workspace_id SET NOT NULL"); expect(migration).toContain("ALTER TABLE public.competitor_alerts ALTER COLUMN workspace_id SET NOT NULL"); expect(migration).not.toContain("ALTER TABLE public.market_trends"); expect(migration).toContain("COMPETITOR_ALERT_WORKSPACE_MISMATCH"); });
 it("scopes competitor UI through the opt-in workspace helper",()=>{ expect(generic).toContain("workspaceScoped?: boolean"); expect(hooks).toContain('useUserQuery<Competitor>("competitors", "competitors", { workspaceScoped: true })'); expect(hooks).toContain('useUserQuery<CompetitorAlert>("competitor_alerts", "competitor-alerts", { limit: 50, workspaceScoped: true })'); expect(hooks).toContain('.eq("workspace_id", workspace.id)'); });
 it("also prepares the market-trend reader for parallel R4a1 without owning its migration",()=>{ expect(hooks).toContain('useUserQuery<MarketTrend>("market_trends", "market-trends", { orderBy: "frequency", limit: 50, workspaceScoped: true })'); });
 it("runs PostgreSQL adversarial verifier in CI",()=>{ if(process.env.CI!=="true")return; execFileSync("bash",["scripts/verify-r4a2-competitor-tenant-boundary.sh"],{cwd:process.cwd(),stdio:"inherit",env:process.env}); });
});
