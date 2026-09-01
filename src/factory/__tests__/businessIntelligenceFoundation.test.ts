import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901160000_business_intelligence_foundation.sql"),
  "utf8",
);
const bridge = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901161000_business_knowledge_scan_bridge.sql"),
  "utf8",
);

describe("Business Intelligence Foundation", () => {
  it("defines normalized source, item and immutable snapshot layers", () => {
    expect(migration).toContain("CREATE TABLE public.business_knowledge_sources");
    expect(migration).toContain("CREATE TABLE public.business_knowledge_items");
    expect(migration).toContain("CREATE TABLE public.business_knowledge_snapshots");
    expect(migration).toContain("REFERENCES public.workspaces(id)");
    expect(migration).toContain("REFERENCES public.business_profiles(id)");
    expect(migration).toContain("REFERENCES public.business_scan_history(id)");
    expect(migration).toMatch(/external_id text NOT NULL[\s\S]*UNIQUE \(workspace_id, business_id, item_type, external_id\)/);
    expect(migration).toContain("content_hash text NOT NULL");
  });

  it("forces RLS and workspace-aware access on all foundation tables", () => {
    for (const table of [
      "business_knowledge_sources",
      "business_knowledge_items",
      "business_knowledge_snapshots",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`public.has_workspace_access(workspace_id)`);
    }
  });

  it("keeps historical snapshots insert-only", () => {
    expect(migration).toContain("CREATE POLICY business_knowledge_snapshots_insert");
    expect(migration).toContain("ON public.business_knowledge_snapshots FOR INSERT TO authenticated");
    expect(migration).not.toContain("business_knowledge_snapshots_update");
    expect(migration).not.toContain("business_knowledge_snapshots_delete");
    expect(migration).toContain("BEFORE INSERT ON public.business_knowledge_snapshots");
    expect(migration).not.toContain("BEFORE INSERT OR UPDATE ON public.business_knowledge_snapshots");
  });

  it("rejects cross-workspace business, scan and source relationships", () => {
    expect(migration).toContain("business_knowledge workspace/business mismatch");
    expect(migration).toContain("business_knowledge workspace/scan mismatch");
    expect(migration).toContain("business_knowledge workspace/source mismatch");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
  });

  it("bridges completed website scans into normalized knowledge and history", () => {
    expect(bridge).toContain("sync_completed_business_scan_to_knowledge");
    expect(bridge).toContain("snapshot_kind");
    expect(bridge).toContain("'website_scan'");
    expect(bridge).toContain("'product'");
    expect(bridge).toContain("'service'");
    expect(bridge).toContain("'contact'");
    expect(bridge).toContain("'link'");
    expect(bridge).toContain("WHEN (NEW.status = 'completed')");
    expect(bridge).toContain("OLD.status IS NOT DISTINCT FROM NEW.status");
    expect(bridge).toContain("encode(digest(");
    expect(bridge).toContain("'sha256'");
  });

  it("keeps tenant bridge functions non-executable by client roles", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.enforce_business_knowledge_workspace()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.enforce_business_knowledge_source_workspace()");
    expect(bridge).toContain("REVOKE ALL ON FUNCTION public.sync_completed_business_scan_to_knowledge()");
  });
});
