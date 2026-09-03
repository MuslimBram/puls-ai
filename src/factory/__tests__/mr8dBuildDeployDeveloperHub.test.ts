import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const core = read("supabase/migrations/20260901230000_leah_build_deploy_control_plane.sql");
const hardening = read("supabase/migrations/20260901230100_leah_build_deploy_hardening.sql");
const worker = read("supabase/functions/leah-build-deploy/index.ts");
const hub = read("supabase/functions/leah-developer-hub/index.ts");
const config = read("supabase/config.toml");
const verifier = read("scripts/verify-leah-build-deploy-developer-hub.sql");

describe("MR8D Build / Deploy / Developer Hub source contract", () => {
  it("persists immutable build and deployment evidence", () => {
    expect(core).toContain("create table public.leah_builds");
    expect(core).toContain("create table public.leah_build_source_artifacts");
    expect(core).toContain("create table public.leah_deployments");
    expect(core).toContain("source_manifest_hash text not null");
    expect(core).toContain("operation_nonce uuid null");
    expect(hardening).toContain("LEAH build admission snapshot is immutable");
    expect(hardening).toContain("LEAH build source evidence is immutable");
    expect(hardening).toContain("LEAH deployment request snapshot is immutable");
    expect(hardening).toContain("LEAH deployment operation nonce is immutable");
  });

  it("requires live Vault material and provider-matched deployment credentials", () => {
    expect(core).toContain("create table public.leah_deployment_targets");
    expect(core).toContain("provider in ('vercel','cloudflare_pages')");
    expect(hardening).toContain("leah_deployment_secret_is_real");
    expect(hardening).toContain("join vault.decrypted_secrets d");
    expect(hardening).toContain("length(d.decrypted_secret) > 0");
    expect(hardening).toContain("Active deployment target requires real Vault-backed provider credential");
    expect(hardening).toContain("Deployment credential is not backed by live Vault material");
  });

  it("keeps Production behind human approval bound to the exact successful build digest", () => {
    expect(core).toContain("environment in ('preview','production')");
    expect(core).toContain("status='awaiting_approval'");
    expect(core).toContain("leah_decide_deployment_for_actor");
    expect(hardening).toContain("Production deployment approval does not match immutable successful build");
    expect(hardening).toContain("new.approval_build_digest is distinct from _build.output_digest");
  });

  it("reserves deployment quota before provider dispatch and supports unknown reconciliation", () => {
    expect(core).toContain("leah_reserve_deployment_for_task");
    expect(core).toContain("deployment_reservation_id uuid null");
    expect(core).toContain("leah_settle_deployment_for_task");
    expect(core).toContain("leah_reconcile_unknown_deployment");
    expect(core).toContain("unknown_since timestamptz null");
    expect(core).toContain("operation_nonce");
  });

  it("exposes a worker-only executor boundary without caller provider or secret injection", () => {
    expect(worker).toContain("requireLeahWorker(req)");
    expect(worker).toContain('"provider_url"');
    expect(worker).toContain('"base_url"');
    expect(worker).toContain('"api_key"');
    expect(worker).toContain('"secret_value"');
    expect(worker).toContain('action === "build.begin"');
    expect(worker).toContain('action === "deployment.begin"');
    expect(worker).toContain('action === "deployment.settle"');
    expect(worker).toContain('action === "deployment.reconcile"');
    expect(worker).not.toMatch(/Deno\.Command|child_process|execSync|spawn\(/);
  });

  it("exposes Developer Hub state through LEAH session authority and never returns secret material", () => {
    expect(hub).toContain("resolveLeahSession(req, admin)");
    expect(hub).toContain("rejectWorkspaceInjection(body)");
    expect(hub).toContain('action === "targets.list"');
    expect(hub).toContain('action === "targets.save"');
    expect(hub).toContain('action === "builds.list"');
    expect(hub).toContain('action === "deployments.list"');
    expect(hub).toContain('action === "deployments.decide"');
    expect(hub).toContain("credential_configured: Boolean(row.credential_secret_id)");
    expect(hub).not.toContain("decrypted_secret");
    expect(hub).not.toContain("secret_value");
  });

  it("registers both custom-auth Edge functions as verify_jwt=false", () => {
    expect(config).toMatch(/\[functions\.leah-build-deploy\]\s+verify_jwt = false/);
    expect(config).toMatch(/\[functions\.leah-developer-hub\]\s+verify_jwt = false/);
  });

  it("ships an adversarial runtime verifier for the complete build/deploy lifecycle", () => {
    expect(verifier).toContain("metadata-only Vault credential activated target");
    expect(verifier).toContain("build snapshot mutation succeeded");
    expect(verifier).toContain("production provider work began without approval");
    expect(verifier).toContain("unknown provider outcome was not durable");
    expect(verifier).toContain("unknown deployment reconciliation failed");
    expect(verifier).toContain("stale lease admitted new build side effect");
    expect(verifier).toContain("MR8D BUILD / DEPLOY / DEVELOPER HUB CONTRACT: PASS");
  });
});
