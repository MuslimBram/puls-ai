import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read=(...p:string[])=>readFileSync(join(process.cwd(),...p),"utf8");
const migration=read("supabase","migrations","20260829194000_r4a2_competitor_workspace_boundary.sql");
const hook=read("src","hooks","useCompetitors.ts");
const analyzer=read("supabase","functions","analyze-competitor","index.ts");

describe("R4a2 competitor workspace boundary",()=>{
 it("makes parent and child workspace mandatory and revokes anon",()=>{
  for(const t of ["competitors","competitor_alerts"]){
   expect(migration).toContain(`ALTER TABLE public.${t} ALTER COLUMN workspace_id SET NOT NULL`);
   expect(migration).toContain(`REVOKE ALL ON TABLE public.${t} FROM anon`);
  }
 });
 it("enforces competitor-alert parent workspace equality",()=>{
  expect(migration).toContain("enforce_r4a2_competitor_alert_parent_workspace");
  expect(migration).toContain("c.workspace_id=NEW.workspace_id");
  expect(analyzer).toContain("workspace_id: competitor.workspace_id");
 });
 it("requires active workspace when adding competitors",()=>{
  expect(hook).toContain('if (!user?.id || !workspace?.id) throw new Error("Workspace is required")');
  expect(hook).toContain("workspace_id: workspace.id");
  expect(hook).toContain('filters: { workspace_id: workspace?.id }');
  expect(hook).toContain('.eq("workspace_id", workspace.id)');
 });
 it("runs the PostgreSQL negative-role verifier in CI",()=>{
  if(process.env.CI!=="true") return;
  execFileSync("bash",["scripts/verify-r4a2-competitor-workspace-boundary.sh"],{cwd:process.cwd(),stdio:"inherit",env:process.env});
 });
});
