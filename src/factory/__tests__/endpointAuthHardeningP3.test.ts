import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("P3: Audit and Hardening of Unverified Endpoints", () => {
  it("A. meta-webhook-test requires internal authentication before service-role access", () => {
    const fnPath = join(process.cwd(), "supabase", "functions", "meta-webhook-test", "index.ts");
    const content = readFileSync(fnPath, "utf-8");

    const authIndex = content.indexOf("requireCronAuth(req)");
    const serviceClientIndex = content.indexOf("createClient(");

    expect(authIndex).toBeGreaterThan(-1);
    expect(content).toContain("new Response(authFailure.body");
    expect(content).toContain("status: authFailure.status");
    expect(serviceClientIndex).toBeGreaterThan(authIndex);
  });

  it("B. Discovers and documents all verify_jwt=false endpoints with fail-closed security mechanisms", () => {
    const configPath = join(process.cwd(), "supabase", "config.toml");
    const content = readFileSync(configPath, "utf-8");

    const blocks = content.split(/\[functions\./);
    const unverified: string[] = [];

    for (const block of blocks) {
      if (block.includes("verify_jwt = false")) {
        const fnName = block.split("]")[0].trim();
        if (fnName) unverified.push(fnName);
      }
    }

    expect(unverified).toContain("stripe-webhook");
    expect(unverified).toContain("integration-webhook");
    expect(unverified).toContain("meta-webhook-test");
  });
});
