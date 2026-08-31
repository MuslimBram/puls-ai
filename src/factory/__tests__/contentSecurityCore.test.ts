import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationByName } from "./readMigrationByName";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = readMigrationByName("content_security_core.sql");
const firewall = read("supabase/functions/content-security-firewall/index.ts");
const config = read("supabase/config.toml");

describe("P0.6 content security core", () => {
  it("creates tenant-bound idempotent security and encrypted quarantine ledgers", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.content_security_events");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.content_security_quarantine");
    expect(migration).toContain("UNIQUE (workspace_id, source, event_id)");
    expect(migration).toContain("REFERENCES public.workspaces(id) ON DELETE RESTRICT");
    expect(migration).toContain("processing_status text NOT NULL DEFAULT 'reserved'");
    expect(migration).toContain("claim_token uuid NOT NULL");
    expect(migration).toContain("content_sha256 text");
  });

  it("keeps direct browser roles out of both security tables", () => {
    expect(migration).toContain("ALTER TABLE public.content_security_events ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.content_security_quarantine ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.content_security_events FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON TABLE public.content_security_quarantine FROM PUBLIC, anon, authenticated");
  });

  it("uses service-role-only claim/bind/finalize/fail RPCs with safe search_path", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_content_security_event");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.bind_content_security_event_fingerprint");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.finalize_content_security_event");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.fail_content_security_event");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("ON CONFLICT (workspace_id, source, event_id) DO NOTHING");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("bind_content_security_event_fingerprint(uuid, text, text, uuid, text)");
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

  it("claims and binds the exact payload fingerprint before the semantic classifier call-site", () => {
    expect(firewall).toContain('admin.rpc("claim_content_security_event"');
    expect(firewall).toContain('"bind_content_security_event_fingerprint"');
    expect(firewall).toContain('code: "SECURITY_EVENT_IN_PROGRESS"');
    expect(firewall).toContain("const contentHash = await sha256Hex");

    const claimCall = firewall.indexOf('admin.rpc("claim_content_security_event"');
    const bindCall = firewall.indexOf('"bind_content_security_event_fingerprint"');
    const semanticCall = firewall.indexOf("decision = await runSemanticClassifier(workspaceId");
    expect(claimCall).toBeGreaterThan(-1);
    expect(bindCall).toBeGreaterThan(-1);
    expect(semanticCall).toBeGreaterThan(-1);
    expect(claimCall).toBeLessThan(bindCall);
    expect(bindCall).toBeLessThan(semanticCall);
  });

  it("prevents an event id from being rebound to a different payload", () => {
    expect(migration).toContain("'content_sha256', v_event.content_sha256");
    expect(migration).toContain("'EVENT_ID_PAYLOAD_MISMATCH'");
    expect(migration).toContain("v_event.content_sha256 <> p_content_sha256");
    expect(migration).toContain("AND content_sha256 = p_content_sha256");
    expect(firewall).toContain('code: "SECURITY_EVENT_FINGERPRINT_MISSING"');
    expect(firewall).toContain('code: "EVENT_ID_PAYLOAD_MISMATCH"');
    expect(firewall).toContain("claim.content_sha256 !== contentHash");
    expect(firewall).toContain('fingerprintBinding.code === "EVENT_ID_PAYLOAD_MISMATCH"');

    const completedCheck = firewall.indexOf("claim.content_sha256 !== contentHash");
    const semanticCall = firewall.indexOf("decision = await runSemanticClassifier(workspaceId");
    expect(completedCheck).toBeGreaterThan(-1);
    expect(completedCheck).toBeLessThan(semanticCall);
  });

  it("reuses completed same-payload decisions without a provider call and protects finalization with a claim token", () => {
    expect(firewall).toContain('claim.status === "completed"');
    expect(firewall).toContain("reused: true");
    expect(firewall).toContain("p_claim_token: claimToken");
    expect(firewall).toContain("p_content_sha256: contentHash");
    expect(migration).toContain("AND claim_token = p_claim_token");
    expect(migration).toContain("CONTENT_SECURITY_CLAIM_NOT_OWNED");
  });

  it("fails closed for unknown semantics and attachments without claiming malware detection", () => {
    expect(firewall).toContain('reasonCode: "SEMANTIC_CLASSIFIER_UNAVAILABLE"');
    expect(firewall).toContain('action: "quarantine"');
    expect(firewall).toContain('category: "unknown"');
    expect(firewall).toContain('reasonCode: "MALWARE_SCANNER_REQUIRED"');
    expect(firewall).toContain('malware: attachment ? "required_external_clamav"');
  });

  it("persists text policy independently so malware-clean cannot override phishing or threats", () => {
    const textDeterministic = firewall.indexOf("let decision = deterministicDecision(content, urls)");
    const textSemantic = firewall.indexOf("decision = await runSemanticClassifier(workspaceId");
    const attachmentLayer = firewall.indexOf("if (attachment) {");
    expect(textDeterministic).toBeGreaterThan(-1);
    expect(textSemantic).toBeGreaterThan(textDeterministic);
    expect(attachmentLayer).toBeGreaterThan(textSemantic);
    expect(firewall).toContain("const textPolicy = decision");
    expect(firewall).toContain("text_policy: {");
    expect(firewall).toContain("category: textPolicy.category");
    expect(firewall).toContain("risk_score: textPolicy.riskScore");
    expect(firewall).toContain("action: textPolicy.action");
    expect(firewall).toContain("reason_code: textPolicy.reasonCode");
    expect(firewall).toContain('reasonCode: "MALWARE_SCANNER_REQUIRED"');
  });

  it("hard-fails quarantine when encrypted payload storage is unavailable", () => {
    expect(firewall).toContain('decision.action === "quarantine" && !encrypted.stored');
    expect(firewall).toContain('"QUARANTINE_ENCRYPTION_UNAVAILABLE"');
    expect(firewall).toContain('code: "QUARANTINE_STORAGE_UNAVAILABLE"');
    expect(migration).toContain("payload_ciphertext text NOT NULL");
    expect(migration).toContain("payload_iv text NOT NULL");
    expect(migration).toContain("QUARANTINE_ENCRYPTION_REQUIRED");
  });

  it("uses deterministic checks for credential theft, prompt injection, threats and suspicious links", () => {
    expect(firewall).toContain('category: "credential_theft"');
    expect(firewall).toContain('category: "prompt_injection"');
    expect(firewall).toContain('category: "threat"');
    expect(firewall).toContain('category: "suspicious_link"');
    expect(firewall).toContain('category: "phishing"');
  });

  it("redacts secrets and credentials before semantic classification and never writes raw event content", () => {
    expect(firewall).toContain("scrubForSemanticClassifier(content)");
    expect(firewall).toContain("[REDACTED_PRIVATE_KEY]");
    expect(firewall).toContain("[REDACTED_RECOVERY_PHRASE]");
    expect(firewall).toContain("[REDACTED_CREDENTIAL]");
    expect(firewall).toContain("[REDACTED_SECRET_ASSIGNMENT]");
    expect(firewall).toContain("[REDACTED_SECRET]");
    expect(firewall).toContain("[REDACTED_JWT]");
    expect(firewall).toContain("p_content_sha256: contentHash");
    expect(firewall).not.toContain("p_content: content");
    expect(migration).not.toContain("raw_content text");
  });

  it("encrypts quarantined payloads with AES-GCM and never completes a metadata-only quarantine", () => {
    expect(firewall).toContain('Deno.env.get("CONTENT_SECURITY_QUARANTINE_KEY")');
    expect(firewall).toContain('name: "AES-GCM"');
    expect(firewall).toContain('alg: "AES-GCM-256"');
    expect(migration).toContain("payload_ciphertext text NOT NULL");
    expect(migration).toContain("payload_iv text NOT NULL");
    expect(migration).toContain("p_quarantine_alg <> 'AES-GCM-256'");
  });
});
