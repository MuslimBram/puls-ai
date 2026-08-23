import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const router = readFileSync(
  join(process.cwd(), "supabase", "functions", "ai-router", "index.ts"),
  "utf-8",
);

const explicitStart = router.indexOf("// ── EXPLICIT PROVIDER OVERRIDE");
const autoStart = router.indexOf("// ── MULTI-PROVIDER FAILOVER ROUTING");
const explicitSection = router.slice(explicitStart, autoStart);

const routeChainsStart = router.indexOf("const ROUTE_CHAINS");
const retryBudgetStart = router.indexOf("// ── RETRY BUDGET");
const routeChainsSection = router.slice(routeChainsStart, retryBudgetStart);

describe("AI router Replicate accounting safety", () => {
  it("blocks explicit Replicate with a stable accounting-unavailable error", () => {
    expect(explicitSection).toContain('providerKey === "REPLICATE"');
    expect(explicitSection).toContain('code: "PROVIDER_ACCOUNTING_UNAVAILABLE"');
    expect(explicitSection).toContain("Replicate is temporarily unavailable until usage accounting is enabled.");
    expect(explicitSection).toContain("}, 503);");
  });

  it("blocks Replicate before any explicit-provider external call", () => {
    const blockIdx = explicitSection.indexOf('providerKey === "REPLICATE"');
    const callIdx = explicitSection.indexOf("await callProvider(providerKey");
    expect(blockIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(-1);
    expect(blockIdx).toBeLessThan(callIdx);
  });

  it("blocks Replicate before any explicit-provider credit charge", () => {
    const blockIdx = explicitSection.indexOf('providerKey === "REPLICATE"');
    const creditIdx = explicitSection.indexOf('from("credit_transactions")');
    expect(blockIdx).toBeGreaterThan(-1);
    expect(creditIdx).toBeGreaterThan(-1);
    expect(blockIdx).toBeLessThan(creditIdx);
  });

  it("blocks Replicate before any explicit-provider quota increment", () => {
    const blockIdx = explicitSection.indexOf('providerKey === "REPLICATE"');
    const incrementIdx = explicitSection.indexOf("incrementAiReplies");
    expect(blockIdx).toBeGreaterThan(-1);
    expect(incrementIdx).toBeGreaterThan(-1);
    expect(blockIdx).toBeLessThan(incrementIdx);
  });

  it("keeps Replicate out of automatic route chains", () => {
    expect(routeChainsStart).toBeGreaterThan(-1);
    expect(retryBudgetStart).toBeGreaterThan(routeChainsStart);
    expect(routeChainsSection).not.toContain("REPLICATE");
  });

  it("preserves existing explicit-provider mappings for other providers", () => {
    expect(explicitSection).toContain('kimi: "KIMI"');
    expect(explicitSection).toContain('groq: "GROQ_LLAMA8B"');
    expect(explicitSection).toContain('deepseek: "DEEPSEEK_FLASH"');
    expect(explicitSection).toContain('gemini: "GEMINI_FLASH"');
    expect(explicitSection).toContain('zai: "ZAI"');
    expect(explicitSection).toContain('openai: "GPT_MINI"');
  });
});
