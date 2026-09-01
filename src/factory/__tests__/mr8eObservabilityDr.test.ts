import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const core = read("supabase/migrations/20260901240000_leah_observability_disaster_recovery.sql");
const hardening = read("supabase/migrations/20260901240100_leah_observability_dr_hardening.sql");
const binding = read("supabase/migrations/20260901240200_leah_recovery_project_binding.sql");
const edge = read("supabase/functions/leah-observability/index.ts");
const config = read("supabase/config.toml");
const playwright = read("playwright.config.ts");
const browser = read("e2e/leah-mr8e-platform-preflight.spec.ts");
const verifier = read("scripts/verify-leah-observability-disaster-recovery.sql");

describe("MR8E Observability / Browser E2E / Disaster Recovery source contract", () => {
  it("persists append-only tenant-bound trace evidence with idempotency", () => {
    expect(core).toContain("create table public.leah_observability_events");
    expect(core).toContain("unique (workspace_id, event_key)");
    expect(core).toContain("foreign key (task_id, execution_id, workspace_id)");
    expect(core).toContain("LEAH observability evidence is append-only");
    expect(core).toContain("LEAH_OBSERVABILITY_IDEMPOTENCY_CONFLICT");
    expect(core).toContain("t.lease_expires_at > clock_timestamp()");
  });

  it("rejects nested secret-like telemetry and recovery material", () => {
    expect(core).toContain("leah_jsonb_contains_secret_key");
    expect(core).toMatch(/api\[_-\]\?key\|token\|secret\|authorization\|password\|cookie\|credential/);
    expect(core).toContain("Secret-like observability attributes are forbidden");
    expect(core).toContain("leah_recovery_manifest_secret_ck");
    expect(core).not.toContain("decrypted_secret");
  });

  it("derives LEAH health from canonical runtime ledgers instead of copied health flags", () => {
    expect(hardening).toContain("public.leah_provider_attempts a join public.leah_executions x");
    expect(hardening).toContain("public.leah_semantic_memory");
    expect(hardening).toContain("public.leah_agent_messages");
    expect(hardening).toContain("public.leah_builds");
    expect(hardening).toContain("public.leah_deployments");
  });

  it("creates hashed recovery manifests from safe canonical references, not physical backups", () => {
    expect(core).toContain("create table public.leah_recovery_checkpoints");
    expect(core).toContain("leah_build_recovery_manifest");
    expect(core).toContain("content_hash");
    expect(core).toContain("source_manifest_hash");
    expect(core).toContain("manifest_hash");
    expect(core).toContain("No physical restore executor is intentionally defined in MR8E");
    expect(core).not.toMatch(/pg_restore|pg_dump|drop database|truncate\s+public\./i);
  });

  it("keeps checkpoints/drills immutable and binds every recovery record to the exact project", () => {
    expect(core).toContain("LEAH recovery checkpoint is immutable");
    expect(hardening).toContain("LEAH recovery drill evidence is append-only");
    expect(hardening).toContain("LEAH recovery plan admission snapshot is immutable");
    expect(binding).toContain("unique(id,project_id,workspace_id)");
    expect(binding).toContain("foreign key(checkpoint_id,project_id,workspace_id)");
  });

  it("requires explicit human approval before a Production recovery plan can even be verified", () => {
    expect(core).toContain("status='awaiting_approval'");
    expect(core).toContain("leah_decide_recovery_plan_for_actor");
    expect(core).toContain("p.environment='production' and p.status='approved'");
    expect(core).toContain("Recovery plan is not authorized for verification");
    expect(core).not.toContain("leah_execute_recovery_plan");
    expect(core).not.toContain("leah_restore_recovery_checkpoint");
  });

  it("exposes worker telemetry and session-safe health/recovery through one custom-auth edge boundary", () => {
    expect(edge).toContain("requireLeahWorker(req)");
    expect(edge).toContain("resolveLeahSession(req, admin)");
    expect(edge).toContain("rejectWorkspaceInjection(body)");
    expect(edge).toContain('action !== "events.emit"');
    expect(edge).toContain('action === "health.get"');
    expect(edge).toContain('action === "recovery.checkpoint.create"');
    expect(edge).toContain('action === "recovery.drill.run"');
    expect(edge).toContain('action === "recovery.plan.decide"');
    expect(config).toMatch(/\[functions\.leah-observability\]\s+verify_jwt = false/);
  });

  it("makes CI browser E2E target explicit instead of silently using a stale Vercel preview", () => {
    expect(playwright).toContain("STAGING_URL is required for Playwright in CI");
    expect(playwright).toContain('baseURL: stagingUrl || "http://127.0.0.1:4173"');
    expect(playwright).not.toContain("puls-bn8m4bg54-muslimbrams-projects.vercel.app");
    expect(browser).toContain("unauthenticated dashboard fails closed to login");
    expect(browser).toContain("public developers route stays on the same configured domain");
    expect(browser).toContain("LEAH_WORKER_SECRET|SUPABASE_SERVICE_ROLE_KEY|LEAH_OPENAI_CODE_API_KEY");
    expect(browser).not.toMatch(/password\s*[:=]\s*["'][^"']+["']/i);
  });

  it("ships an adversarial SQL verifier spanning telemetry and recovery gates", () => {
    expect(verifier).toContain("telemetry idempotency conflict was accepted");
    expect(verifier).toContain("secret-like telemetry attribute persisted");
    expect(verifier).toContain("cross-workspace observability read succeeded");
    expect(verifier).toContain("recovery checkpoint mutation succeeded");
    expect(verifier).toContain("production recovery verification ran without approval");
    expect(verifier).toContain("stale task lease emitted telemetry");
    expect(verifier).toContain("MR8E OBSERVABILITY / BROWSER E2E / DISASTER RECOVERY CONTRACT: PASS");
  });
});
