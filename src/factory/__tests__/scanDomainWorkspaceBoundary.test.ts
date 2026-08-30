import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260829165000_scan_domain_workspace_boundary.sql"),
  "utf8",
);
const scanSources = readFileSync(resolve(process.cwd(), "src/hooks/useScanSources.ts"), "utf8");
const scanInsights = readFileSync(resolve(process.cwd(), "src/hooks/useScanInsights.ts"), "utf8");
const extractor = readFileSync(resolve(process.cwd(), "supabase/functions/scan-source-extract/index.ts"), "utf8");

describe("Scan domain workspace boundary", () => {
  it("hardens only the four clean scan tables", () => {
    expect(migration).not.toMatch(/create policy[\s\S]{0,500}has_role\s*\(/i);
    for (const table of ["business_ai_content", "scan_sources", "source_scans", "scan_insights"]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).not.toContain('drop policy if exists "Admins can manage all business scans"');
    expect(migration).not.toContain('p1_business_scan_history_');
  });

  it("uses canonical workspace helpers for browser policies", () => {
    expect(migration).toContain("public.has_workspace_access(workspace_id)");
    expect(migration).toContain("public.has_workspace_role(workspace_id,array['owner','admin','member'])");
  });

  it("preserves the current clean browser scan workflow", () => {
    expect(scanSources).toContain('.from("scan_sources").insert');
    expect(scanSources).toContain('.from("source_scans").insert');
    expect(scanInsights).toContain('.from("scan_insights")');
    expect(migration).toContain("grant select, insert, update, delete on public.scan_sources to authenticated");
    expect(migration).toContain("grant select, insert, update on public.source_scans to authenticated");
    expect(migration).toContain("grant select, update on public.scan_insights to authenticated");
  });

  it("keeps generated result writes backend-only", () => {
    expect(migration).toContain("grant select on public.business_ai_content to authenticated");
    expect(migration).not.toContain("grant select, insert on public.business_ai_content to authenticated");
    expect(migration).not.toContain("grant select, insert, update on public.scan_insights to authenticated");
    expect(extractor).toContain("getServiceKey()");
    expect(extractor).toContain("const supabaseAdmin");
  });

  it("locks tenant/creator identity and validates parent lineage", () => {
    expect(migration).toContain("workspace_id is immutable");
    expect(migration).toContain("user_id is immutable");
    expect(migration).toContain("generated_by is immutable");
    expect(migration).toContain("source_scans source workspace mismatch");
    expect(migration).toContain("scan_insights scan lineage mismatch");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
  });

  it("revokes broad browser and sandbox grants", () => {
    expect(migration).toContain("from public, anon, authenticated, sandbox_exec, service_role");
    expect(migration).toContain("to service_role");
  });

  const pgIt = process.env.CI === "true" ? it : it.skip;
  pgIt("passes the isolated PostgreSQL adversarial verifier", () => {
    execFileSync("bash", ["scripts/verify-scan-domain-workspace-boundary.sh"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      timeout: 120_000,
    });
  });
});
