// supabase/functions/_shared/failover-router.ts
// ============================================================
// PULSE AI — AI-1A3 Intelligent Multi-Provider Failover
// Normalized error taxonomy · Multi-candidate route chains
// Bounded retry + provider failover · Same-context continuity
// ============================================================

// ── PROVIDER FAILURE TAXONOMY ─────────────────────────────────
/**
 * Normalized provider failure categories.
 * Never expose raw provider error bodies to callers.
 */
export type ProviderFailureCategory =
  | "RATE_LIMITED"
  | "PROVIDER_QUOTA_EXHAUSTED"
  | "AUTH_OR_CONFIG_FAILURE"
  | "TIMEOUT"
  | "TRANSIENT_PROVIDER_FAILURE"
  | "UNSUPPORTED_REQUEST"
  | "PERMANENT_PROVIDER_FAILURE";

export interface ProviderAttemptResult {
  providerKey: string;
  providerName: string;
  success: boolean;
  failureCategory?: ProviderFailureCategory;
  /** Safe summary — never contains raw provider body or secret data */
  failureSummary?: string;
}

export interface FailoverResult<T> {
  value: T;
  providerKey: string;
  providerName: string;
  attemptedProviders: ProviderAttemptResult[];
  fallbackUsed: boolean;
  totalAttempts: number;
}

/**
 * Classify an HTTP status + optional provider message into the canonical taxonomy.
 * This must never return any raw provider error body.
 */
export function classifyProviderFailure(
  status: number,
  message: string,
): ProviderFailureCategory {
  // Explicit permanent failures
  if (status === 400) return "UNSUPPORTED_REQUEST";
  if (status === 401 || status === 403) return "AUTH_OR_CONFIG_FAILURE";

  // Provider quota / billing (402 or explicit quota signal)
  if (status === 402) return "PROVIDER_QUOTA_EXHAUSTED";
  const msgLower = message.toLowerCase();
  if (
    msgLower.includes("quota") ||
    msgLower.includes("credit") ||
    msgLower.includes("billing") ||
    msgLower.includes("insufficient_quota") ||
    msgLower.includes("limit exceeded")
  ) return "PROVIDER_QUOTA_EXHAUSTED";

  // Rate limiting
  if (status === 429) return "RATE_LIMITED";
  if (msgLower.includes("rate_limited") || msgLower.includes("rate limit")) return "RATE_LIMITED";

  // Timeout
  if (msgLower.includes("timeout") || msgLower.includes("aborted")) return "TIMEOUT";

  // 5xx transient
  if (status >= 500 && status < 600) return "TRANSIENT_PROVIDER_FAILURE";
  if (msgLower.includes("provider_error") || msgLower.includes("transient")) return "TRANSIENT_PROVIDER_FAILURE";

  // Auth / missing provider configuration — eligible for next-provider failover.
  // Must be checked BEFORE the generic permanent_failure fallthrough so that
  // messages like "permanent_failure (auth) API key not configured" are not
  // misclassified as PERMANENT_PROVIDER_FAILURE (which stops the chain).
  if (
    msgLower.includes("(auth)") ||
    msgLower.includes("api key not configured") ||
    msgLower.includes("api key missing") ||
    msgLower.includes("unauthorized") ||
    msgLower.includes("authentication")
  ) return "AUTH_OR_CONFIG_FAILURE";

  // Generic permanent / non-recoverable provider failure — stops the chain
  if (msgLower.includes("permanent_failure")) return "PERMANENT_PROVIDER_FAILURE";

  return "PERMANENT_PROVIDER_FAILURE";
}

/**
 * Is this failure category eligible for failover to the next provider?
 * UNSUPPORTED_REQUEST (malformed user input) must NOT be forwarded to every provider.
 */
export function isEligibleForProviderFailover(
  category: ProviderFailureCategory,
): boolean {
  switch (category) {
    case "RATE_LIMITED":
    case "PROVIDER_QUOTA_EXHAUSTED":
    case "AUTH_OR_CONFIG_FAILURE":   // missing/invalid key → try another
    case "TIMEOUT":
    case "TRANSIENT_PROVIDER_FAILURE":
      return true;
    case "UNSUPPORTED_REQUEST":       // bad user request → stop
    case "PERMANENT_PROVIDER_FAILURE":
      return false;
  }
}

// ── PROVIDER HEALTH / COOLDOWN ────────────────────────────────
// DURABLE_PROVIDER_HEALTH = OPEN
// No durable health store exists.  We use request-scoped exclusion only.
// In-process cooldown is a best-effort optimization — never authoritative.
interface CooldownEntry { until: number; category: ProviderFailureCategory }
const inProcessCooldowns = new Map<string, CooldownEntry>();

const COOLDOWN_MS: Record<ProviderFailureCategory, number> = {
  RATE_LIMITED:              60_000,
  PROVIDER_QUOTA_EXHAUSTED: 300_000,
  AUTH_OR_CONFIG_FAILURE:   120_000,
  TIMEOUT:                   10_000,
  TRANSIENT_PROVIDER_FAILURE: 15_000,
  UNSUPPORTED_REQUEST:            0,
  PERMANENT_PROVIDER_FAILURE:     0,
};

export function recordProviderCooldown(
  key: string,
  category: ProviderFailureCategory,
  retryAfterMs?: number,
): void {
  const ms = retryAfterMs ?? COOLDOWN_MS[category] ?? 30_000;
  if (ms > 0) {
    inProcessCooldowns.set(key, { until: Date.now() + ms, category });
  }
}

/** Reset all in-process cooldown state. Use in tests to prevent cross-test contamination. */
export function clearInProcessCooldowns(): void {
  inProcessCooldowns.clear();
}

export function isProviderOnCooldown(key: string): boolean {
  const entry = inProcessCooldowns.get(key);
  if (!entry) return false;
  if (Date.now() < entry.until) return true;
  inProcessCooldowns.delete(key);
  return false;
}

// ── MULTI-PROVIDER FAILOVER ENGINE ───────────────────────────
export interface ProviderCallOptions {
  /** Keys already attempted in this request — prevents double-attempt */
  attempted: Set<string>;
}

/**
 * Execute an ordered chain of provider candidates with bounded per-provider
 * retry and cross-provider failover.
 *
 * - Same authorized task context is forwarded unchanged to every candidate.
 * - Customer entitlement check must happen BEFORE calling this function.
 * - Billing/usage increment is returned once on success (caller's responsibility).
 * - No provider is attempted twice.
 */
export async function executeWithFailover<T>(
  chain: readonly string[],
  callFn: (providerKey: string) => Promise<T>,
  nameFn: (providerKey: string) => string,
  options: ProviderCallOptions = { attempted: new Set() },
): Promise<FailoverResult<T>> {
  const attempts: ProviderAttemptResult[] = [];
  const attempted = options.attempted;

  for (const key of chain) {
    // Never attempt the same provider twice in one request
    if (attempted.has(key)) continue;
    attempted.add(key);

    // Skip providers on in-process cooldown (best-effort only)
    if (isProviderOnCooldown(key)) {
      attempts.push({
        providerKey: key,
        providerName: nameFn(key),
        success: false,
        failureCategory: "RATE_LIMITED",
        failureSummary: "provider skipped — in-process cooldown active",
      });
      continue;
    }

    try {
      const value = await callFn(key);
      attempts.push({ providerKey: key, providerName: nameFn(key), success: true });
      return {
        value,
        providerKey: key,
        providerName: nameFn(key),
        attemptedProviders: attempts,
        fallbackUsed: attempts.filter(a => a.success).length === 0
          ? false
          : attempts.findIndex(a => a.success) > 0,
        totalAttempts: attempts.length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const httpStatusMatch = msg.match(/\((\d{3})\)/);
      const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1], 10) : 0;
      const category = classifyProviderFailure(httpStatus, msg);

      // Safe summary — omit raw provider body
      const safeSummary = `${category} (http=${httpStatus > 0 ? httpStatus : "n/a"})`;

      // Record cooldown (process-local, best-effort)
      const retryAfterMatch = msg.match(/retry.after[:\s]+(\d+)/i);
      const retryAfterMs = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) * 1000 : undefined;
      recordProviderCooldown(key, category, retryAfterMs);

      attempts.push({
        providerKey: key,
        providerName: nameFn(key),
        success: false,
        failureCategory: category,
        failureSummary: safeSummary,
      });

      // Malformed user request — stop chain immediately
      if (!isEligibleForProviderFailover(category)) {
        throw new FailoverExhaustedError(attempts, `Request cannot be retried: ${safeSummary}`);
      }

      // Move to next eligible provider
      console.warn(`[failover-router] ${key} failed (${safeSummary}) — trying next candidate`);
    }
  }

  // All candidates exhausted
  throw new FailoverExhaustedError(attempts, "All provider candidates exhausted");
}

export class FailoverExhaustedError extends Error {
  constructor(
    public readonly attempts: ProviderAttemptResult[],
    message: string,
  ) {
    super(message);
    this.name = "FailoverExhaustedError";
  }
}
