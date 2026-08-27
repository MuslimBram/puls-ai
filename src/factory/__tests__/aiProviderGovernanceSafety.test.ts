import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf-8");

const healthMigration = read("supabase", "migrations", "20260824004000_ai_provider_health.sql");
const usageMigration = read("supabase", "migrations", "20260824004500_ai_usage_governance.sql");
const governance = read("supabase", "functions", "_shared", "ai-provider-governance.ts");
const runtimeCheck = read("supabase", "functions", "ai-router-runtime-check", "index.ts");
const router = read("supabase", "functions", "ai-router", "index.ts");

describe("AI provider durable health schema", () => {
  it("keeps provider health server-only with RLS and explicit browser revokes", () => {
    expect(healthMigration).toContain("CREATE TABLE IF NOT EXISTS public.ai_provider_health");
    expect(healthMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(healthMigration).toContain("REVOKE ALL ON TABLE public.ai_provider_health FROM anon, authenticated");
    expect(healthMigration).toContain("TO service_role");
  });

  it("uses the canonical failure taxonomy and service-role-only RPCs", () => {
    for (const category of [
      "RATE_LIMITED",
      "PROVIDER_QUOTA_EXHAUSTED",
      "AUTH_OR_CONFIG_FAILURE",
      "TIMEOUT",
      "TRANSIENT_PROVIDER_FAILURE",
      "UNSUPPORTED_REQUEST",
      "PERMANENT_PROVIDER_FAILURE",
    ]) {
      expect(healthMigration).toContain(category);
    }
    expect(healthMigration).toContain("record_ai_provider_failure");
    expect(healthMigration).toContain("record_ai_provider_success");
    expect(healthMigration).toContain("SECURITY DEFINER");
    expect(healthMigration).toContain("REVOKE ALL ON FUNCTION public.record_ai_provider_failure");
    expect(healthMigration).toContain("GRANT EXECUTE ON FUNCTION public.record_ai_provider_failure");
  });

  it("models cooldown and quota exhaustion separately", () => {
    expect(healthMigration).toContain("cooldown_until timestamptz");
    expect(healthMigration).toContain("quota_exhausted_until timestamptz");
    expect(healthMigration).toContain("consecutive_failures");
  });
});

describe("AI usage governance schema", () => {
  it("separates one logical request from provider candidate attempts", () => {
    expect(usageMigration).toContain("CREATE TABLE IF NOT EXISTS public.ai_usage_requests");
    expect(usageMigration).toContain("CREATE TABLE IF NOT EXISTS public.ai_provider_attempts");
    expect(usageMigration).toContain("request_id uuid NOT NULL REFERENCES public.ai_usage_requests(id)");
    expect(usageMigration).toContain("UNIQUE (request_id, attempt_index)");
  });

  it("keeps both ledgers server-only", () => {
    expect(usageMigration).toContain("REVOKE ALL ON TABLE public.ai_usage_requests FROM anon, authenticated");
    expect(usageMigration).toContain("REVOKE ALL ON TABLE public.ai_provider_attempts FROM anon, authenticated");
    expect(usageMigration).toContain("TO service_role");
  });

  it("stores request usage independently from internal attempt costs", () => {
    expect(usageMigration).toContain("successful_provider_key");
    expect(usageMigration).toContain("total_provider_attempts");
    expect(usageMigration).toContain("provider_key text NOT NULL");
    expect(usageMigration).toContain("cost_usd numeric(14,8)");
  });
});

describe("provider governance helper", () => {
  it("fails open only for observability storage absence, not by inventing provider health", () => {
    expect(governance).toContain("loadDurablyUnavailableProviders");
    expect(governance).toContain("durable provider health unavailable");
    expect(governance).toContain("return new Set()");
  });

  it("has separate success/failure health writers and request/attempt ledger writers", () => {
    expect(governance).toContain("recordDurableProviderSuccess");
    expect(governance).toContain("recordDurableProviderFailure");
    expect(governance).toContain("startAiUsageRequest");
    expect(governance).toContain("recordAiProviderAttempt");
    expect(governance).toContain("finishAiUsageRequest");
  });
});

describe("ai-router provider governance wiring", () => {
  it("starts one logical usage request after entitlement checks and before provider execution", () => {
    const entitlement = router.indexOf("Daily AI reply limit reached");
    const usageStart = router.indexOf("await startAiUsageRequest");
    const providerCall = router.indexOf("const governedProviderCall");
    expect(entitlement).toBeGreaterThan(-1);
    expect(usageStart).toBeGreaterThan(entitlement);
    expect(providerCall).toBeGreaterThan(usageStart);
  });

  it("checks durable health before explicit and automatic provider execution", () => {
    expect(router).toContain("loadDurablyUnavailableProviders");
    expect(router).toContain("PROVIDER_TEMPORARILY_UNAVAILABLE");
    expect(router).toContain("ALL_PROVIDERS_UNAVAILABLE");
    const automaticHealthGate = router.lastIndexOf("await loadDurablyUnavailableProviders");
    const failoverCall = router.indexOf("await executeWithFailover(");
    expect(automaticHealthGate).toBeGreaterThan(-1);
    expect(failoverCall).toBeGreaterThan(automaticHealthGate);
  });

  it("records provider attempts separately from the logical request", () => {
    expect(router).toContain("recordAiProviderAttempt");
    expect(router).toContain("recordDurableProviderSuccess");
    expect(router).toContain("recordDurableProviderFailure");
    expect(router).toContain("totalProviderAttempts: providerAttemptIndex");
  });

  it("keeps customer quota at one increment per successful logical failover request", () => {
    const failoverCall = router.indexOf("await executeWithFailover(");
    const failoverCatch = router.indexOf("if (err instanceof FailoverExhaustedError)");
    expect(failoverCall).toBeGreaterThan(-1);
    expect(failoverCatch).toBeGreaterThan(failoverCall);
    const successSection = router.slice(failoverCall, failoverCatch);
    expect((successSection.match(/incrementAiReplies/g) ?? []).length).toBe(1);
  });

  it("preserves Replicate accounting block before governed provider execution", () => {
    const replicateBlock = router.indexOf('providerKey === "REPLICATE"');
    const explicitCall = router.indexOf("await governedProviderCall(providerKey)");
    expect(replicateBlock).toBeGreaterThan(-1);
    expect(explicitCall).toBeGreaterThan(replicateBlock);
    expect(router).toContain("PROVIDER_ACCOUNTING_UNAVAILABLE");
  });

  it("returns a safe request id for observability without exposing provider errors", () => {
    expect(router).toContain("request_id: usageRequestId");
    expect(router).not.toContain("raw_provider_body");
  });
});

describe("AI free-first paid fallback policy", () => {
  it("tries documented free allowances before every paid candidate", () => {
    expect(router).toContain("FREE_ALLOWANCE_PROVIDERS");
    expect(router).toContain("configuredChain.filter((key) => FREE_ALLOWANCE_PROVIDERS.has(key))");
    expect(router).toContain("configuredChain.filter((key) => !FREE_ALLOWANCE_PROVIDERS.has(key))");
  });

  it("fails closed for paid calls without a working spend ledger", () => {
    expect(router).toContain("AI_PAID_FALLBACK_ENABLED");
    expect(router).toContain("AI_PAID_DAILY_BUDGET_USD");
    expect(router).toContain("SPEND_LEDGER_UNAVAILABLE");
    expect(router).toContain("DAILY_PAID_BUDGET_REACHED");
    expect(router).toContain("Paid fallback blocked");
  });
});

describe("bounded ai-router runtime acceptance harness", () => {
  it("requires server-side cron authentication", () => {
    expect(runtimeCheck).toContain('requireCronAuth(req)');
    expect(runtimeCheck).toContain('Deno.env.get("INTERNAL_WEBHOOK_SECRET")');
    expect(runtimeCheck).toContain("getServiceKey()");
  });

  it("is hard-coded to one Groq request with a 16-token ceiling", () => {
    expect(runtimeCheck).toContain('provider: "groq"');
    expect(runtimeCheck).toContain('content: "Reply only OK"');
    expect(runtimeCheck).toContain("max_tokens: 16");
    expect(runtimeCheck).not.toContain("await req.json()");
    expect(runtimeCheck).not.toContain("req.json()");
  });

  it("returns safe result metadata instead of provider credentials or raw headers", () => {
    expect(runtimeCheck).toContain("response_exact_ok");
    expect(runtimeCheck).toContain("provider_key");
    expect(runtimeCheck).toContain("credits_used");
    expect(runtimeCheck).not.toContain("GROQ_API_KEY");
    expect(runtimeCheck).not.toContain("api_key");
  });
});

describe("Edge TypeScript syntax gate", () => {
  it("transpiles the changed Edge sources without TypeScript syntax diagnostics", () => {
    for (const [name, source] of [
      ["ai-router", router],
      ["ai-provider-governance", governance],
      ["ai-router-runtime-check", runtimeCheck],
    ] as const) {
      const result = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        reportDiagnostics: true,
        fileName: `${name}.ts`,
      });
      const errors = (result.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      expect(errors, `${name} syntax diagnostics`).toEqual([]);
    }
  });
});
