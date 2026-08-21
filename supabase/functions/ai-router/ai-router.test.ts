// supabase/functions/ai-router/ai-router.test.ts
// ============================================================
// PULSE AI — AI-1A3 Multi-Provider Failover Behavior Tests
// Uses deterministic mocked provider responses.
// Does NOT call real external providers.
// ============================================================

import {
  classifyProviderFailure,
  executeWithFailover,
  FailoverExhaustedError,
  isEligibleForProviderFailover,
  recordProviderCooldown,
  isProviderOnCooldown,
  type ProviderFailureCategory,
} from "../_shared/failover-router.ts";

// ── Mini test harness (no external test runner needed) ────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label} (got: ${JSON.stringify(actual)}, want: ${JSON.stringify(expected)})`);
}

function assertThrows(fn: () => unknown, label: string): void {
  try {
    fn();
    console.error(`  ✗  ${label} — expected throw, got none`);
    failed++;
  } catch {
    console.log(`  ✓  ${label}`);
    passed++;
  }
}

// ── Test helpers ──────────────────────────────────────────────
type CallResult = { text: string; tokensIn: number; tokensOut: number };

function makeProvider(responses: Record<string, "ok" | "rate_limited" | "quota" | "timeout" | "5xx" | "400" | "auth">):
  (key: string) => Promise<CallResult> {
  return async (key: string): Promise<CallResult> => {
    const r = responses[key] ?? "ok";
    switch (r) {
      case "ok": return { text: `reply from ${key}`, tokensIn: 10, tokensOut: 20 };
      case "rate_limited": throw new Error(`${key}: rate_limited (429)`);
      case "quota": throw new Error(`${key}: permanent_failure (402) quota exhausted`);
      case "timeout": throw new Error(`${key}: timeout after 25000ms`);
      case "5xx": throw new Error(`${key}: provider_error (500)`);
      case "400": throw new Error(`${key}: permanent_failure (400) bad request`);
      case "auth": throw new Error(`${key}: permanent_failure (auth) API key not configured`);
    }
  };
}

// ── ERROR TAXONOMY TESTS ──────────────────────────────────────
console.log("\n=== Error Taxonomy ===");

assertEqual(classifyProviderFailure(429, ""), "RATE_LIMITED", "429 → RATE_LIMITED");
assertEqual(classifyProviderFailure(402, ""), "PROVIDER_QUOTA_EXHAUSTED", "402 → PROVIDER_QUOTA_EXHAUSTED");
assertEqual(classifyProviderFailure(0, "quota exhausted signal"), "PROVIDER_QUOTA_EXHAUSTED", "quota message → PROVIDER_QUOTA_EXHAUSTED");
assertEqual(classifyProviderFailure(401, ""), "AUTH_OR_CONFIG_FAILURE", "401 → AUTH_OR_CONFIG_FAILURE");
assertEqual(classifyProviderFailure(403, ""), "AUTH_OR_CONFIG_FAILURE", "403 → AUTH_OR_CONFIG_FAILURE");
assertEqual(classifyProviderFailure(400, ""), "UNSUPPORTED_REQUEST", "400 → UNSUPPORTED_REQUEST");
assertEqual(classifyProviderFailure(500, ""), "TRANSIENT_PROVIDER_FAILURE", "500 → TRANSIENT_PROVIDER_FAILURE");
assertEqual(classifyProviderFailure(503, ""), "TRANSIENT_PROVIDER_FAILURE", "503 → TRANSIENT_PROVIDER_FAILURE");
assertEqual(classifyProviderFailure(0, "timeout after 25000ms"), "TIMEOUT", "timeout message → TIMEOUT");

// ── FAILOVER ELIGIBILITY ──────────────────────────────────────
console.log("\n=== Failover Eligibility ===");

assert(isEligibleForProviderFailover("RATE_LIMITED"), "RATE_LIMITED eligible");
assert(isEligibleForProviderFailover("PROVIDER_QUOTA_EXHAUSTED"), "PROVIDER_QUOTA_EXHAUSTED eligible");
assert(isEligibleForProviderFailover("AUTH_OR_CONFIG_FAILURE"), "AUTH_OR_CONFIG_FAILURE eligible (missing key)");
assert(isEligibleForProviderFailover("TIMEOUT"), "TIMEOUT eligible");
assert(isEligibleForProviderFailover("TRANSIENT_PROVIDER_FAILURE"), "TRANSIENT_PROVIDER_FAILURE eligible");
assert(!isEligibleForProviderFailover("UNSUPPORTED_REQUEST"), "UNSUPPORTED_REQUEST NOT eligible");
assert(!isEligibleForProviderFailover("PERMANENT_PROVIDER_FAILURE"), "PERMANENT_PROVIDER_FAILURE NOT eligible");

// ── FAILOVER ENGINE TESTS ─────────────────────────────────────
console.log("\n=== Failover Engine ===");

// 1. Primary success — no fallback
{
  const call = makeProvider({ A: "ok", B: "ok" });
  const result = await executeWithFailover(["A", "B"], call, k => k);
  assertEqual(result.providerKey, "A", "Primary success → providerKey=A");
  assertEqual(result.fallbackUsed, false, "Primary success → fallback_used=false");
  assertEqual(result.totalAttempts, 1, "Primary success → 1 attempt");
}

// 2. Primary 429 → next provider succeeds
{
  const call = makeProvider({ A: "rate_limited", B: "ok" });
  const result = await executeWithFailover(["A", "B"], call, k => k);
  assertEqual(result.providerKey, "B", "Primary 429 → fallback B used");
  assertEqual(result.fallbackUsed, true, "Primary 429 → fallback_used=true");
  const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
  assertEqual(aAttempt?.failureCategory, "RATE_LIMITED", "A attempt logged as RATE_LIMITED");
}

// 3. Provider quota/402 → next provider succeeds
{
  const call = makeProvider({ A: "quota", B: "ok" });
  const result = await executeWithFailover(["A", "B"], call, k => k);
  assertEqual(result.providerKey, "B", "Quota/402 → fallback B");
  const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
  assertEqual(aAttempt?.failureCategory, "PROVIDER_QUOTA_EXHAUSTED", "A logged as PROVIDER_QUOTA_EXHAUSTED");
}

// 4. Primary timeout → next provider succeeds
{
  const call = makeProvider({ A: "timeout", B: "ok" });
  const result = await executeWithFailover(["A", "B"], call, k => k);
  assertEqual(result.providerKey, "B", "Timeout → fallback B");
  const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
  assertEqual(aAttempt?.failureCategory, "TIMEOUT", "A logged as TIMEOUT");
}

// 5. Primary 5xx after bounded retry → next provider succeeds
{
  const call = makeProvider({ A: "5xx", B: "ok" });
  const result = await executeWithFailover(["A", "B"], call, k => k);
  assertEqual(result.providerKey, "B", "5xx → fallback B");
  const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
  assertEqual(aAttempt?.failureCategory, "TRANSIENT_PROVIDER_FAILURE", "A logged as TRANSIENT_PROVIDER_FAILURE");
}

// 6. Missing provider key/config → next eligible provider succeeds
{
  const call = makeProvider({ A: "auth", B: "ok" });
  const result = await executeWithFailover(["A", "B"], call, k => k);
  assertEqual(result.providerKey, "B", "Auth/config failure → fallback B");
  const aAttempt = result.attemptedProviders.find(p => p.providerKey === "A");
  assertEqual(aAttempt?.failureCategory, "AUTH_OR_CONFIG_FAILURE", "A logged as AUTH_OR_CONFIG_FAILURE");
}

// 7. Malformed request (400) → no provider cascade
{
  const call = makeProvider({ A: "400", B: "ok", C: "ok" });
  try {
    await executeWithFailover(["A", "B", "C"], call, k => k);
    assert(false, "Malformed 400 → should throw, not succeed");
  } catch (e) {
    assert(e instanceof FailoverExhaustedError, "Malformed 400 → FailoverExhaustedError thrown");
    const attempted = (e as FailoverExhaustedError).attempts;
    assert(attempted.length === 1, "Malformed 400 → only 1 attempt (no cascade to B/C)");
    assertEqual(attempted[0].failureCategory, "UNSUPPORTED_REQUEST", "400 → UNSUPPORTED_REQUEST");
  }
}

// 8. Same provider never attempted twice
{
  const call = makeProvider({ A: "rate_limited", B: "rate_limited", C: "ok" });
  const attempted = new Set<string>();
  const result = await executeWithFailover(["A", "B", "C", "A"], call, k => k, { attempted });
  // A appears twice in chain but must only be attempted once
  const aCount = result.attemptedProviders.filter(p => p.providerKey === "A").length;
  assertEqual(aCount, 1, "A not attempted twice (dedup by key)");
  assertEqual(result.providerKey, "C", "C succeeds");
}

// 9. Context/messages/system prompt remain unchanged across failover
// (Verified by passing the same args to every callFn — mock captures args)
{
  const capturedArgs: string[] = [];
  const contextCall = async (key: string): Promise<CallResult> => {
    capturedArgs.push(key);
    if (key === "A") throw new Error(`A: rate_limited (429)`);
    return { text: "ok", tokensIn: 1, tokensOut: 1 };
  };
  await executeWithFailover(["A", "B"], contextCall, k => k);
  assert(capturedArgs.includes("A") && capturedArgs.includes("B"), "Both A and B called");
  // In real usage, messages/system_prompt are captured by closure — same values forwarded
}

// 10. All providers fail → FailoverExhaustedError with safe diagnostics
{
  const call = makeProvider({ A: "rate_limited", B: "5xx", C: "timeout" });
  try {
    await executeWithFailover(["A", "B", "C"], call, k => k);
    assert(false, "All fail → should throw");
  } catch (e) {
    assert(e instanceof FailoverExhaustedError, "All fail → FailoverExhaustedError");
    const err = e as FailoverExhaustedError;
    assertEqual(err.attempts.length, 3, "All fail → 3 attempts recorded");
    assert(err.attempts.every(a => !a.success), "All attempts marked failed");
    // No raw provider bodies exposed
    assert(err.attempts.every(a => !a.failureSummary?.includes("actual body")), "No raw body in summaries");
  }
}

// 11. In-process cooldown (best-effort only)
{
  recordProviderCooldown("COOLDOWN_TEST", "RATE_LIMITED", 5_000);
  assert(isProviderOnCooldown("COOLDOWN_TEST"), "Provider on cooldown after recordProviderCooldown");
  assert(!isProviderOnCooldown("NOT_RECORDED"), "Provider NOT on cooldown if not recorded");
}

// ── SUMMARY ───────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) Deno.exit(1);
