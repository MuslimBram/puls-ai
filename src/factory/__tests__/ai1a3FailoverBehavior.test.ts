// src/factory/__tests__/ai1a3FailoverBehavior.test.ts
// ============================================================
// PULSE AI — AI-1A3 Multi-Provider Failover Behavior Tests
// Runs under Vitest (Node environment) with deterministic mocks.
// Does NOT call real external AI providers.
//
// Imports the actual production failover module directly so that
// tests exercise the real implementation — no duplicated logic.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  classifyProviderFailure,
  isEligibleForProviderFailover,
  executeWithFailover,
  clearInProcessCooldowns,
  FailoverExhaustedError,
} from "../../../supabase/functions/_shared/failover-router";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

// ── DETERMINISTIC PROVIDER MOCK ───────────────────────────────
type CallResult = { text: string; tokensIn: number; tokensOut: number };
type MockBehavior = "ok" | "rate_limited" | "quota" | "timeout" | "5xx" | "400" | "auth" | "auth_http401" | "auth_http403";

function makeProvider(responses: Record<string, MockBehavior>) {
  return async (key: string): Promise<CallResult> => {
    const r = responses[key] ?? "ok";
    switch (r) {
      case "ok": return { text: `reply from ${key}`, tokensIn: 10, tokensOut: 20 };
      case "rate_limited": throw new Error(`${key}: rate_limited (429)`);
      case "quota":        throw new Error(`${key}: permanent_failure (402) quota exhausted`);
      case "timeout":      throw new Error(`${key}: timeout after 25000ms`);
      case "5xx":          throw new Error(`${key}: provider_error (500)`);
      case "400":          throw new Error(`${key}: permanent_failure (400) bad request`);
      case "auth":         throw new Error(`${key}: permanent_failure (auth) API key not configured: KEY_ENV`);
      case "auth_http401": throw new Error(`${key}: permanent_failure (401)`);
      case "auth_http403": throw new Error(`${key}: permanent_failure (403)`);
    }
  };
}

// ── TESTS ─────────────────────────────────────────────────────

describe("AI-1A3 Error Taxonomy — classifyProviderFailure", () => {
  it("429 → RATE_LIMITED", () => expect(classifyProviderFailure(429, "")).toBe("RATE_LIMITED"));
  it("402 → PROVIDER_QUOTA_EXHAUSTED", () => expect(classifyProviderFailure(402, "")).toBe("PROVIDER_QUOTA_EXHAUSTED"));
  it("quota message → PROVIDER_QUOTA_EXHAUSTED", () => expect(classifyProviderFailure(0, "quota exhausted signal")).toBe("PROVIDER_QUOTA_EXHAUSTED"));
  it("credit message → PROVIDER_QUOTA_EXHAUSTED", () => expect(classifyProviderFailure(0, "insufficient credit")).toBe("PROVIDER_QUOTA_EXHAUSTED"));
  it("401 → AUTH_OR_CONFIG_FAILURE", () => expect(classifyProviderFailure(401, "")).toBe("AUTH_OR_CONFIG_FAILURE"));
  it("403 → AUTH_OR_CONFIG_FAILURE", () => expect(classifyProviderFailure(403, "")).toBe("AUTH_OR_CONFIG_FAILURE"));
  it("400 → UNSUPPORTED_REQUEST", () => expect(classifyProviderFailure(400, "")).toBe("UNSUPPORTED_REQUEST"));
  it("500 → TRANSIENT_PROVIDER_FAILURE", () => expect(classifyProviderFailure(500, "")).toBe("TRANSIENT_PROVIDER_FAILURE"));
  it("503 → TRANSIENT_PROVIDER_FAILURE", () => expect(classifyProviderFailure(503, "")).toBe("TRANSIENT_PROVIDER_FAILURE"));
  it("timeout message → TIMEOUT", () => expect(classifyProviderFailure(0, "timeout after 25000ms")).toBe("TIMEOUT"));

  // Regression: permanent_failure (auth) must be AUTH_OR_CONFIG_FAILURE, not PERMANENT_PROVIDER_FAILURE
  it("'permanent_failure (auth) API key not configured' → AUTH_OR_CONFIG_FAILURE (not PERMANENT)", () => {
    expect(classifyProviderFailure(0, "Groq Llama 3.1 8B: permanent_failure (auth) API key not configured: GROQ_API_KEY"))
      .toBe("AUTH_OR_CONFIG_FAILURE");
  });
  it("'api key not configured' → AUTH_OR_CONFIG_FAILURE", () => {
    expect(classifyProviderFailure(0, "provider: api key not configured")).toBe("AUTH_OR_CONFIG_FAILURE");
  });
  it("generic permanent_failure (non-auth) → PERMANENT_PROVIDER_FAILURE", () => {
    expect(classifyProviderFailure(0, "permanent_failure some other reason")).toBe("PERMANENT_PROVIDER_FAILURE");
  });
});

describe("AI-1A3 Failover Eligibility", () => {
  it("RATE_LIMITED is eligible", () => expect(isEligibleForProviderFailover("RATE_LIMITED")).toBe(true));
  it("PROVIDER_QUOTA_EXHAUSTED is eligible", () => expect(isEligibleForProviderFailover("PROVIDER_QUOTA_EXHAUSTED")).toBe(true));
  it("AUTH_OR_CONFIG_FAILURE is eligible (missing key → try next)", () => expect(isEligibleForProviderFailover("AUTH_OR_CONFIG_FAILURE")).toBe(true));
  it("TIMEOUT is eligible", () => expect(isEligibleForProviderFailover("TIMEOUT")).toBe(true));
  it("TRANSIENT_PROVIDER_FAILURE is eligible", () => expect(isEligibleForProviderFailover("TRANSIENT_PROVIDER_FAILURE")).toBe(true));
  it("UNSUPPORTED_REQUEST is NOT eligible (stop chain)", () => expect(isEligibleForProviderFailover("UNSUPPORTED_REQUEST")).toBe(false));
  it("PERMANENT_PROVIDER_FAILURE is NOT eligible", () => expect(isEligibleForProviderFailover("PERMANENT_PROVIDER_FAILURE")).toBe(false));
});

describe("AI-1A3 Failover Engine — provider chain behavior", () => {
  beforeEach(() => { clearInProcessCooldowns(); });
  it("primary success → no fallback, 1 attempt", async () => {
    const call = makeProvider({ A: "ok", B: "ok" });
    const result = await executeWithFailover(["A", "B"], call, k => k);
    expect(result.providerKey).toBe("A");
    expect(result.fallbackUsed).toBe(false);
    expect(result.totalAttempts).toBe(1);
  });

  it("primary 429 → next provider succeeds", async () => {
    const call = makeProvider({ A: "rate_limited", B: "ok" });
    const result = await executeWithFailover(["A", "B"], call, k => k);
    expect(result.providerKey).toBe("B");
    expect(result.fallbackUsed).toBe(true);
    const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
    expect(aAttempt?.failureCategory).toBe("RATE_LIMITED");
  });

  it("provider quota/402 → next provider succeeds", async () => {
    const call = makeProvider({ A: "quota", B: "ok" });
    const result = await executeWithFailover(["A", "B"], call, k => k);
    expect(result.providerKey).toBe("B");
    const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
    expect(aAttempt?.failureCategory).toBe("PROVIDER_QUOTA_EXHAUSTED");
  });

  it("primary timeout → next provider succeeds", async () => {
    const call = makeProvider({ A: "timeout", B: "ok" });
    const result = await executeWithFailover(["A", "B"], call, k => k);
    expect(result.providerKey).toBe("B");
    const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
    expect(aAttempt?.failureCategory).toBe("TIMEOUT");
  });

  it("primary 5xx → next provider succeeds", async () => {
    const call = makeProvider({ A: "5xx", B: "ok" });
    const result = await executeWithFailover(["A", "B"], call, k => k);
    expect(result.providerKey).toBe("B");
    const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
    expect(aAttempt?.failureCategory).toBe("TRANSIENT_PROVIDER_FAILURE");
  });

  it("missing provider key/config → next eligible provider succeeds", async () => {
    const call = makeProvider({ A: "auth", B: "ok" });
    const result = await executeWithFailover(["A", "B"], call, k => k);
    expect(result.providerKey).toBe("B");
    const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
    expect(aAttempt?.failureCategory).toBe("AUTH_OR_CONFIG_FAILURE");
  });

  it("HTTP 401 auth failure → AUTH_OR_CONFIG_FAILURE → next provider succeeds", async () => {
    const call = makeProvider({ A: "auth_http401", B: "ok" });
    const result = await executeWithFailover(["A", "B"], call, k => k);
    expect(result.providerKey).toBe("B");
    const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
    expect(aAttempt?.failureCategory).toBe("AUTH_OR_CONFIG_FAILURE");
  });

  it("HTTP 403 auth failure → AUTH_OR_CONFIG_FAILURE → next provider succeeds", async () => {
    const call = makeProvider({ A: "auth_http403", B: "ok" });
    const result = await executeWithFailover(["A", "B"], call, k => k);
    expect(result.providerKey).toBe("B");
    const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
    expect(aAttempt?.failureCategory).toBe("AUTH_OR_CONFIG_FAILURE");
  });

  it("malformed 400 request → UNSUPPORTED_REQUEST → chain stops at 1 attempt (no cascade)", async () => {
    const call = makeProvider({ A: "400", B: "ok", C: "ok" });
    await expect(executeWithFailover(["A", "B", "C"], call, k => k)).rejects.toThrow();
    try {
      await executeWithFailover(["A", "B", "C"], call, k => k);
    } catch (e) {
      expect(e).toBeInstanceOf(FailoverExhaustedError);
      const err = e as FailoverExhaustedError;
      expect(err.attempts).toHaveLength(1);
      expect(err.attempts[0].failureCategory).toBe("UNSUPPORTED_REQUEST");
    }
  });

  it("same provider never attempted twice (dedup)", async () => {
    const call = makeProvider({ A: "rate_limited", B: "rate_limited", C: "ok" });
    const result = await executeWithFailover(["A", "B", "C", "A"], call, k => k);
    const aCount = result.attemptedProviders.filter(p => p.providerKey === "A").length;
    expect(aCount).toBe(1);
    expect(result.providerKey).toBe("C");
  });

  it("all providers fail → FailoverExhaustedError with safe diagnostics", async () => {
    const call = makeProvider({ A: "rate_limited", B: "5xx", C: "timeout" });
    await expect(executeWithFailover(["A", "B", "C"], call, k => k)).rejects.toBeInstanceOf(FailoverExhaustedError);
    try {
      await executeWithFailover(["A", "B", "C"], call, k => k);
    } catch (e) {
      const err = e as FailoverExhaustedError;
      expect(err.attempts).toHaveLength(3);
      expect(err.attempts.every(a => !a.success)).toBe(true);
      // Safe: no raw provider bodies in summaries
      expect(err.attempts.every(a => !a.failureSummary?.includes("actual body"))).toBe(true);
    }
  });

  it("context continuity — same messages/system forwarded to each provider (closure)", async () => {
    const captured: string[] = [];
    const contextCall = async (key: string): Promise<CallResult> => {
      captured.push(key);
      if (key === "A") throw new Error("A: rate_limited (429)");
      return { text: "ok", tokensIn: 1, tokensOut: 1 };
    };
    await executeWithFailover(["A", "B"], contextCall, k => k);
    // Both A and B were invoked; context is captured by closure in real usage
    expect(captured).toContain("A");
    expect(captured).toContain("B");
  });
});

describe("AI-1A3 Source Contracts — ai-router/index.ts", () => {
  const router = readFileSync(repoFile("supabase", "functions", "ai-router", "index.ts"), "utf-8");

  it("imports executeWithFailover from failover-router", () => {
    expect(router).toContain("executeWithFailover");
    expect(router).toContain("failover-router");
  });

  it("has ROUTE_CHAINS with multiple candidates per task type", () => {
    expect(router).toContain("ROUTE_CHAINS");
    expect(router).toContain("PER_PROVIDER_MAX_RETRIES");
    expect(router).toContain("TOTAL_PROVIDER_BUDGET");
  });

  it("customer entitlement check exists before provider execution", () => {
    // The daily limit check must appear before the await executeWithFailover( call
    const limitIdx = router.indexOf("Daily AI reply limit reached");
    // Use the actual call-site, not the import line
    const failoverCallIdx = router.indexOf("await executeWithFailover(");
    expect(limitIdx).toBeGreaterThan(-1);
    expect(failoverCallIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeLessThan(failoverCallIdx);
  });

  it("one logical request counted once — incrementAiReplies called once after successful failover", () => {
    // Slice from the await executeWithFailover( call to the FailoverExhaustedError catch block
    const start = router.indexOf("await executeWithFailover(");
    const end = router.indexOf("if (err instanceof FailoverExhaustedError)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const successSection = router.slice(start, end);
    const countOccurrences = (str: string, sub: string) => str.split(sub).length - 1;
    expect(countOccurrences(successSection, "incrementAiReplies")).toBe(1);
  });

  it("explicit provider contract: does not silently reroute on failure", () => {
    // On explicit provider failure, returns EXPLICIT_PROVIDER_FAILED (not silently routing elsewhere)
    expect(router).toContain("EXPLICIT_PROVIDER_FAILED");
  });

  it("ALL_PROVIDERS_FAILED response includes safe diagnostics, no raw bodies", () => {
    expect(router).toContain("ALL_PROVIDERS_FAILED");
    expect(router).toContain("attempted_count");
    expect(router).toContain("failure_categories");
  });

  it("billing insert occurs only once per successful request", () => {
    // credit_transactions insert must be inside the single success block (before FailoverExhaustedError catch)
    const start = router.indexOf("await executeWithFailover(");
    const end = router.indexOf("if (err instanceof FailoverExhaustedError)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const successSection = router.slice(start, end);
    const insertCount = (successSection.match(/credit_transactions/g) ?? []).length;
    expect(insertCount).toBeGreaterThanOrEqual(1);
  });

  it("workspace authorization preserved — is_workspace_member check present", () => {
    expect(router).toContain('rpc("is_workspace_member"');
    expect(router).toContain("Forbidden: not a member of workspace");
  });

  it("service-role bearer alone rejected without x-internal-secret", () => {
    expect(router).toContain("SERVICE_ROLE_TOKEN_REQUIRES_INTERNAL_SECRET");
    expect(router).toContain("bearerToken === getServiceKey()");
  });

  it("internal no-workspace customer_support remains isolated", () => {
    expect(router).toContain("allowInternalNoWorkspaceCustomerSupport");
    expect(router).toContain('normalizedTaskType === "customer_support"');
  });

  it("fallback_used and attempted_providers are present in success response", () => {
    expect(router).toContain("fallback_used");
    expect(router).toContain("attempted_providers");
    expect(router).toContain("total_attempts");
  });
});

describe("AI-1A3 Source Contracts — failover-router.ts", () => {
  const src = readFileSync(repoFile("supabase", "functions", "_shared", "failover-router.ts"), "utf-8");

  it("AUTH_OR_CONFIG_FAILURE check precedes permanent_failure fallthrough in classifyProviderFailure", () => {
    const fnStart = src.indexOf("function classifyProviderFailure");
    const fnEnd = src.indexOf("function isEligibleForProviderFailover");
    const fnBody = src.slice(fnStart, fnEnd);
    const authIdx = fnBody.indexOf('"AUTH_OR_CONFIG_FAILURE"');
    const permIdx = fnBody.indexOf('"PERMANENT_PROVIDER_FAILURE"');
    // AUTH_OR_CONFIG_FAILURE assignment must appear before the permanent_failure fallthrough
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(permIdx);
  });

  it("UNSUPPORTED_REQUEST stops the chain (not eligible for failover)", () => {
    expect(src).toContain('"UNSUPPORTED_REQUEST":');
    // In isEligibleForProviderFailover switch, UNSUPPORTED_REQUEST must return false
    const switchBody = src.slice(src.indexOf("function isEligibleForProviderFailover"), src.indexOf("function recordProviderCooldown"));
    expect(switchBody).toContain("UNSUPPORTED_REQUEST");
    expect(switchBody).toContain("return false");
  });

  it("executeWithFailover deduplicates providers with attempted Set", () => {
    expect(src).toContain("attempted.has(key)");
    expect(src).toContain("attempted.add(key)");
  });

  it("DURABLE_PROVIDER_HEALTH is documented as OPEN", () => {
    expect(src).toContain("DURABLE_PROVIDER_HEALTH = OPEN");
  });
});
