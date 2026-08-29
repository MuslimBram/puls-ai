import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// P0.5-B source contract: tenancy must follow the active workspace, not user_id.
const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260829160000_p0_5_b_crm_deals_pipeline_workspace_isolation.sql",
);
const crmPath = resolve(process.cwd(), "src/hooks/useCRM.ts");

const migration = readFileSync(migrationPath, "utf8");
const crm = readFileSync(crmPath, "utf8");
const pipelineHook = crm.slice(crm.indexOf("export const usePipelineStages"), crm.indexOf("export const useDeals"));
const dealsHook = crm.slice(crm.indexOf("export const useDeals"), crm.indexOf("export const useDealNotes"));

describe("P0.5-B CRM tenant isolation source contract", () => {
  it("uses the canonical caller-bound workspace helpers", () => {
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_workspace_role(workspace_id, array['owner','admin','member'])");
    expect(migration).not.toMatch(/has_role\s*\(\s*auth\.uid\(\)\s*,\s*['\"](?:admin|super_admin)['\"]\s*\)/i);
    expect(migration).not.toContain("has_workspace_role((select auth.uid()),");
  });

  it("contains fail-closed stage ownership guards", () => {
    expect(migration).toContain("NULL rows have no deterministic owner workspace");
    expect(migration).toContain("NULL rows have ambiguous owner workspace mapping");
    expect(migration).toContain("ps.user_id");
    expect(migration).toContain("w.owner_id = ps.user_id");
    expect(migration).toContain("workspace_id remains after deterministic backfill");
  });

  it("requires non-null tenant identity and protects it from UPDATE", () => {
    expect(migration).toContain("alter table public.pipeline_stages alter column workspace_id set not null");
    expect(migration).toContain("alter table public.deals alter column workspace_id set not null");
    expect(migration).toContain("new.workspace_id is distinct from old.workspace_id");
    expect(migration).toContain("new.user_id is distinct from old.user_id");
  });

  it("enforces same-workspace stage and lead parents", () => {
    expect(migration).toContain("ps.workspace_id = new.workspace_id");
    expect(migration).toContain("l.workspace_id = new.workspace_id");
    expect(migration).toContain("deals stage workspace mismatch");
    expect(migration).toContain("deals lead workspace mismatch");
  });

  it("uses least-privilege table grants", () => {
    expect(migration).toContain("revoke all privileges on table public.pipeline_stages from public, anon, authenticated, sandbox_exec, service_role");
    expect(migration).toContain("revoke all privileges on table public.deals from public, anon, authenticated, sandbox_exec, service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.pipeline_stages to authenticated, service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.deals to authenticated, service_role");
    expect(migration).not.toContain("grant all privileges");
  });

  it("keeps viewer read-only and member delete-restricted", () => {
    expect(migration).toContain("for select to authenticated");
    expect(migration).toContain("p0_5_b owners admins delete pipeline_stages");
    expect(migration).toContain("p0_5_b owners admins delete deals");
    expect(migration).not.toMatch(/p0_5_b owners admins delete deals[\s\S]*array\['owner','admin','member'\]/);
  });

  it("makes CRM queries and creation workspace-authoritative", () => {
    expect(crm).toContain('import { useWorkspace } from "@/contexts/WorkspaceContext";');
    expect(pipelineHook).toContain("queryKey: [\"pipeline-stages\", workspace?.id]");
    expect(pipelineHook).toContain('.eq("workspace_id", workspace!.id)');
    expect(pipelineHook).toContain("workspace_id: workspace.id");
    expect(dealsHook).toContain("queryKey: [\"deals\", workspace?.id]");
    expect(dealsHook).toContain('.eq("workspace_id", workspace!.id)');
    expect(dealsHook).toContain("workspace_id: workspace.id");
    expect(pipelineHook).not.toContain('.eq("user_id", user!.id)');
    expect(dealsHook).not.toContain('.eq("user_id", user!.id)');
  });
});
