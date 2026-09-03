import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20260902135000_business_intelligence_integration_closure.sql");
const helper = read("supabase/functions/_shared/business-deep-scan.ts");
const extractor = read("supabase/functions/business-scan-extract/index.ts");
const generator = read("supabase/functions/generate-business-content/index.ts");
const saveBridge = read("supabase/functions/save-scan-to-knowledge-base/index.ts");
const hook = read("src/hooks/useBusinessScans.ts");

describe("Business Intelligence final integration closure", () => {
  it("adds monotonic execution fencing and requires every page-side effect to use it", () => {
    expect(migration).toContain("execution_claim_version bigint not null default 0");
    expect(migration).toContain("execution_claim_version=sh.execution_claim_version + 1");
    expect(extractor).toContain("execution_claim_version");
    expect(extractor).toContain('.eq("execution_claim_version", claimVersion)');
    expect(extractor).toContain("Business scan execution claim lost");
    expect(migration).toContain("enforce_business_scan_page_execution_claim");
    expect(migration).toContain("business scan page execution claim lost");
    expect(migration).toContain("clear_business_scan_pages_on_new_claim");
    expect(migration).toContain("p.execution_claim_version=sh.execution_claim_version");
    expect(extractor).toContain("execution_claim_version: claimVersion");
    expect(extractor).not.toContain('.from("scan_insights")');
  });

  it("creates scan history/source/source-scan atomically from server-derived workspace authority", () => {
    expect(migration).toContain("create_business_scan_request");
    expect(migration).toContain("public.has_workspace_role(v_workspace_id,array['owner','admin','member']::text[])");
    expect(migration).toContain("insert into public.scan_sources");
    expect(migration).toContain("insert into public.business_scan_history");
    expect(migration).toContain("insert into public.source_scans");
    expect(hook).toContain('rpc("create_business_scan_request"');
    expect(hook).not.toMatch(/\.from\("business_scan_history"\)[\s\S]{0,300}\.insert\(/);
    expect(hook).not.toMatch(/\.from\("source_scans"\)[\s\S]{0,300}\.insert\(/);
  });

  it("screens the exact page URL and persists only the screened link subset", () => {
    expect(helper).toContain("normalizedPageUrl");
    expect(helper).toContain("urls: [normalizedPageUrl, ...links.filter");
    expect(extractor).toContain("const screenedLinks = links.slice(0, 49)");
    expect(extractor).toContain("links: screenedLinks");
  });

  it("captures immutable snapshots only after canonical provenance admission", () => {
    expect(migration).toContain("capture_business_knowledge_scan_snapshot");
    expect(migration).toContain("trg_zz_capture_business_knowledge_scan_snapshot");
    expect(migration).toContain("from public.business_knowledge_items i");
    expect(migration).toContain("and i.scan_history_id=new.id");
    expect(migration).toContain("and i.is_current=true");
    expect(migration).not.toContain("'products',coalesce(new.products_found");
  });

  it("removes legacy profile/knowledge post-processing from scan completion", () => {
    expect(migration).toContain("reject_legacy_scan_post_process_job");
    expect(migration).toContain("legacy scan_post_process is disabled");
    expect(extractor).not.toContain('.from("job_queue")');
    expect(extractor).not.toContain("triggerJobWorker");
    expect(extractor).not.toContain('job_type: "scan_post_process"');
  });

  it("prevents hard deletes of canonical sources/items by service code", () => {
    expect(migration).toContain("revoke delete on table public.business_knowledge_sources from service_role");
    expect(migration).toContain("revoke delete on table public.business_knowledge_items from service_role");
  });

  it("feeds marketing generation only from canonical business knowledge", () => {
    expect(generator).toContain('.from("business_knowledge_items")');
    expect(generator).toContain("Canonical security-approved website knowledge");
    expect(generator).not.toContain("products_found");
    expect(generator).not.toContain("services_found");
    expect(generator).not.toContain("summary_json");
  });

  it("turns manual save into canonical acknowledgement, not a legacy chunk writer", () => {
    expect(saveBridge).toContain('.from("business_knowledge_sources")');
    expect(saveBridge).toContain('.from("business_knowledge_items")');
    expect(saveBridge).not.toContain('.from("knowledge_sources")');
    expect(saveBridge).not.toContain('.from("knowledge_chunks")');
    expect(saveBridge).toContain("canonical_items");
    expect(saveBridge).toContain("chunks_created: 0");
  });
});
