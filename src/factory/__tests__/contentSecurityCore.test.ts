import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260830184500_content_security_core.sql");
const firewall = read("supabase/functions/content-security-firewall/index.ts");
const config = read("supabase/config.toml");

describe("P0.6 content security core", () => {
  it("creates tenant-bound idempotent security and quarantine ledgers", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.content_security_events");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.content_security_quarantine");
    expect(migration).toContain("UNIQUE (workspace_id, source, event_id)");
    expect(migration).toContain("REFERENCES public.workspaces(id) ON DELETE RESTRICT");
  });

  it("keeps direct browser roles out of both security tables", () => {
    expect(migration).toContain("ALTER TABLE public.content_security_events ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.content_security_quarantine ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.content_security_events FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON TABLE public.content_security_quarantine FROM PUBLIC, anon, authenticated");
  });

  it("records one event and quarantine atomically through a service-role-only RPC", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.record_content_security_event");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("ON CONFLICT (workspace_id, source, event_id) DO NOTHING");
    expect(migration).toContain("ON CONFLICT (security_event_id) DO NOTHING");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  it("makes the firewall internal-only rather than browser callable", () => {
    expect(config).toContain("[functions.content-security-firewall]");
    expect(config).toContain("verify_jwt = false");
    expect(firewall).toContain('req.headers.get("x-internal-secret")');
    expect(firewall).toContain('req.headers.get("apikey")');
    expect(firewall).toContain("getServiceKey()");
    expect(firewall).toContain('code: "INTERNAL_SERVICE_ONLY"');
    expect(firewall).not.toContain("Access-Control-Allow-Origin");
  });

  it("reuses an existing event before any semantic provider call", () => {
    expect(firewall.indexOf("const { data: existingEvent")).toBeLessThan(firewall.indexOf("runSemanticClassifier(workspaceId"));
    expect(firewall).toContain("reused: true");
  });

  it("fails closed for unknown semantics and for attachments without a real malware scanner", () => {
    expect(firewall).toContain('reasonCode: "SEMANTIC_CLASSIFIER_UNAVAILABLE"');
    expect(firewall).toContain('action: "quarantine"');
    expect(firewall).toContain('reasonCode: "MALWARE_SCANNER_REQUIRED"');
    expect(firewall).toContain('malware: attachment ? "required_not_integrated"');
  });

  it("uses deterministic checks for credential theft, prompt injection, threats and suspicious links", () => {
    expect(firewall).toContain('category: "credential_theft"');
    expect(firewall).toContain('category: "prompt_injection"');
    expect(firewall).toContain('category: "threat"');
    expect(firewall).toContain('category: "suspicious_link"');
    expect(firewall).toContain('category: "phishing"');
  });

  it("redacts secrets before semantic classification and never writes raw content to the event ledger", () => {
    expect(firewall).toContain("scrubForSemanticClassifier(content)");
    expect(firewall).toContain("[REDACTED_SECRET]");
    expect(firewall).toContain("[REDACTED_JWT]");
    expect(firewall).toContain("p_content_sha256: contentHash");
    expect(firewall).not.toContain("p_content: content");
    expect(migration).not.toContain("raw_content text");
  });

  it("encrypts quarantined payloads with AES-GCM when a quarantine key is configured", () => {
    expect(firewall).toContain('Deno.env.get("CONTENT_SECURITY_QUARANTINE_KEY")');
    expect(firewall).toContain('name: "AES-GCM"');
    expect(firewall).toContain('alg: "AES-GCM-256"');
    expect(migration).toContain("payload_ciphertext text");
    expect(migration).toContain("payload_iv text");
  });
});
