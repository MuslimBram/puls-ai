import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const scriptPath = path.resolve(process.cwd(), "scripts/run-leah-macro-run-9.mjs");
const script = fs.readFileSync(scriptPath, "utf8");

describe("MR9 Golden Journey harness contract", () => {
  it("is staging-only and explicitly refuses the Pulse AI Production Supabase ref", () => {
    expect(script).toContain("MR9_TARGET");
    expect(script).toContain('target !== "staging"');
    expect(script).toContain("wlvlgghqwwhhqaqqopml");
    expect(script).toContain("refuses the Pulse AI Production Supabase project");
  });

  it("requires all runtime authority and Preview-deploy inputs from environment variables", () => {
    for (const name of [
      "MR9_SUPABASE_URL",
      "MR9_SUPABASE_ANON_KEY",
      "MR9_TEST_EMAIL",
      "MR9_TEST_PASSWORD",
      "MR9_WORKSPACE_ID",
      "MR9_WORKER_SECRET",
      "MR9_DEPLOY_TARGET_ID",
    ]) {
      expect(script).toContain(name);
    }
    expect(script).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}\./);
    expect(script).not.toMatch(/sk-[a-zA-Z0-9_-]{20,}/);
  });

  it("requires the full positive authority chain before PASS", () => {
    for (const evidence of [
      "LEAH direct session issuance",
      "project create",
      "execution first start",
      "execution idempotent replay",
      "worker claims live task lease",
      "worker claimed an unrelated staging task",
      "Agent Bus send",
      "task-bound provider catalog",
      "real task-bound provider inference",
      "provider attempt canonical settlement",
      "real semantic memory embedding",
      "observability emits lease-bound event",
      "session reads canonical runtime health",
      "recovery checkpoint create",
      "recovery integrity drill",
      "Preview recovery plan verify",
      "staging build admission",
      "staging build settlement",
      "Preview deployment request",
      "Preview deployment quota reservation",
      "worker finishes claimed task",
      "session revoke",
    ]) {
      expect(script).toContain(evidence);
    }
    expect(script).toContain("MR9 GOLDEN JOURNEY: PASS");
  });

  it("covers fail-closed negatives before side effects", () => {
    for (const evidence of [
      "session rejects missing JWT",
      "LEAH API rejects workspace injection",
      "worker rejects wrong secret",
      "Agent Bus conflicting idempotency reuse rejected",
      "provider proxy rejects model injection",
      "semantic memory rejects workspace injection",
      "observability rejects workspace injection",
      "observability rejects secret-like attributes",
      "revoked session fails closed",
    ]) {
      expect(script).toContain(evidence);
    }
  });

  it("does not allow skipped provider or deploy gates to become green", () => {
    expect(script).toContain('const deploymentTargetId = required("MR9_DEPLOY_TARGET_ID")');
    expect(script).toContain("task-bound provider catalog is empty");
    expect(script).not.toContain('record("build/deploy positive path", "SKIP"');
  });

  it("does not pretend the MR8D control plane performs a physical cloud deploy", () => {
    expect(script).toContain("physical cloud deploy remains external to MR8D control plane");
    expect(script).not.toContain("deploy_to_vercel");
  });
});
