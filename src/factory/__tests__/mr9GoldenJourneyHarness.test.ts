import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const scriptPath = path.resolve(process.cwd(), "scripts/run-leah-macro-run-9.mjs");
const script = fs.readFileSync(scriptPath, "utf8");

describe("MR9 Golden Journey harness contract", () => {
  it("is staging-only and explicitly refuses the Pulse AI Production Supabase ref", () => {
    expect(script).toContain('MR9_TARGET');
    expect(script).toContain('target !== "staging"');
    expect(script).toContain('wlvlgghqwwhhqaqqopml');
    expect(script).toContain('refuses the Pulse AI Production Supabase project');
  });

  it("requires runtime credentials only through environment variables", () => {
    for (const name of [
      "MR9_SUPABASE_URL",
      "MR9_SUPABASE_ANON_KEY",
      "MR9_TEST_EMAIL",
      "MR9_TEST_PASSWORD",
      "MR9_WORKSPACE_ID",
      "MR9_WORKER_SECRET",
    ]) {
      expect(script).toContain(name);
    }
    expect(script).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}\./);
    expect(script).not.toMatch(/sk-[a-zA-Z0-9_-]{20,}/);
  });

  it("covers the positive authority chain", () => {
    for (const evidence of [
      "LEAH direct session issuance",
      "project create",
      "execution first start",
      "worker claims live task lease",
      "Agent Bus send",
      "task-bound provider catalog",
      "real semantic memory embedding",
      "observability emits lease-bound event",
      "recovery checkpoint create",
      "recovery integrity drill",
      "worker finishes claimed task",
      "session revoke",
    ]) {
      expect(script).toContain(evidence);
    }
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

  it("does not pretend the MR8D control plane performs a physical cloud deploy", () => {
    expect(script).toContain("physical cloud deploy remains external to MR8D control plane");
    expect(script).not.toContain("deploy_to_vercel");
  });
});
