import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** Matches `.catch(` applied to a Postgrest builder chain on one statement. */
const BUILDER_CATCH = /\.(from\("[a-z_]+"\)|rpc\("[a-z_]+")[^;]*\.catch\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const rel = join(dir, entry);
    const abs = resolve(process.cwd(), rel);
    if (statSync(abs).isDirectory()) walk(rel, out);
    else if (entry.endsWith(".ts")) out.push(rel);
  }
  return out;
}

function builderCatchSites(): string[] {
  const sites: string[] = [];
  for (const file of walk("supabase/functions")) {
    read(file)
      .split("\n")
      .forEach((line, i) => {
        if (BUILDER_CATCH.test(line)) sites.push(`${file}:${i + 1}`);
      });
  }
  return sites.sort();
}

describe("FAZA 0 — the PostgrestBuilder.catch defect, mechanically", () => {
  it("proves a query builder is a thenable with NO .catch", () => {
    // No network: the builder is lazy and only issues a request inside then().
    const sb = createClient("http://localhost:1/", "anon-key");
    const builder: any = sb.from("t").select("*").eq("a", 1);

    expect(typeof builder.then).toBe("function");
    expect(typeof builder.catch).toBe("undefined");
    expect(typeof builder.finally).toBe("undefined");
    expect(builder instanceof Promise).toBe(false);
  });

  it("proves calling .catch() on one throws SYNCHRONOUSLY, before any request", () => {
    const sb = createClient("http://localhost:1/", "anon-key");
    const builder: any = sb.from("t").select("*");

    // Synchronous throw — not a rejected promise. This is why the pattern
    // aborts the whole handler instead of swallowing an error, and why the
    // query is never sent.
    expect(() => builder.catch(() => {})).toThrow(TypeError);
    expect(() => builder.catch(() => {})).toThrow(/catch is not a function/);
  });
});

describe("FAZA 0 — regression ratchet for the .catch defect class", () => {
  /**
   * Pre-existing offenders inherited from main, each verified against the
   * DEPLOYED source. They are OUT OF SCOPE for this authorisation (FAZA 0
   * covers D14 + V9 only) and are deliberately left untouched rather than
   * quietly fixed in a payment PR.
   *
   * This list is a ratchet, not an allowlist: a NEW occurrence fails the build,
   * and removing one requires deleting its line here, which makes the fix
   * visible in review.
   *
   * Tracked in report 44 (ANEKS A). Verdicts from deployed source:
   *   agent-orchestrator   v50  BROKEN — success return unreachable
   *   security-monitor     v50  BROKEN — aborts exactly when a threat is found
   *   workspace-scheduler  v50  BROKEN — aborts on every invocation
   *   integration-wizard   v52  deployed copy is CLEAN; repo copy is not
   *   others                    not yet verified against deployed source
   */
  const KNOWN_OFFENDERS = [
    "supabase/functions/agent-orchestrator/index.ts:71",
    "supabase/functions/agent-orchestrator/index.ts:74",
    "supabase/functions/broadcast-send-engine/index.ts:156",
    "supabase/functions/generate-commissions/index.ts:37",
    "supabase/functions/install-industry-pack/index.ts:200",
    "supabase/functions/integration-wizard/index.ts:58",
    "supabase/functions/learning-engine/index.ts:60",
    "supabase/functions/learning-engine/index.ts:98",
    "supabase/functions/security-monitor/index.ts:361",
    "supabase/functions/sso-handler/index.ts:29",
    "supabase/functions/sso-handler/index.ts:35",
    "supabase/functions/workspace-scheduler/index.ts:39",
    "supabase/functions/workspace-scheduler/index.ts:43",
  ].sort();

  it("introduces no new .catch on a Postgrest builder anywhere under supabase/functions", () => {
    expect(builderCatchSites()).toEqual(KNOWN_OFFENDERS);
  });

  it("keeps the two functions in this PR's scope free of the defect", () => {
    const inScope = builderCatchSites().filter(
      (s) => s.includes("process-manual-payment") || s.includes("ai-fraud-check"),
    );
    expect(inScope).toEqual([]);
  });
});

describe("FAZA 0 / D14 — process-manual-payment invariants", () => {
  const fn = read("supabase/functions/process-manual-payment/index.ts");

  it("contains no executable .catch on a query chain", () => {
    const executable = fn
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .filter((l) => l.includes(".catch("));
    expect(executable).toEqual([]);
  });

  it("writes billing_history BEFORE activating the subscription", () => {
    const billing = fn.indexOf('.from("billing_history")\n          .insert(');
    const subscription = fn.indexOf('.from("subscriptions").upsert(');
    expect(billing).toBeGreaterThan(-1);
    expect(subscription).toBeGreaterThan(-1);
    // The v42 order was the reverse, which is what stranded the customer on an
    // active paid plan with no invoice.
    expect(billing).toBeLessThan(subscription);
  });

  it("marks the payment complete LAST, after the subscription", () => {
    const subscription = fn.indexOf('.from("subscriptions").upsert(');
    const completion = fn.indexOf('status: "paid",');
    expect(completion).toBeGreaterThan(subscription);
  });

  it("aborts on a billing_history failure instead of continuing", () => {
    expect(fn).toContain("billing_history insert failed");
    expect(fn).toMatch(/if \(billingError \|\| !bh\) \{\s*\n\s*throw new Error/);
  });

  it("deduplicates the invoice by reference_id", () => {
    expect(fn).toContain('.from("billing_history")');
    expect(fn).toContain('.eq("reference_id", mp.reference_id)');
    expect(fn).toContain("let billingId");
  });

  it("checks the error of every state-changing query", () => {
    for (const marker of [
      "subscriptions upsert failed",
      "manual_payments completion failed",
      "manual_payments reject failed",
      "manual_payments submit failed",
    ]) {
      expect(fn).toContain(marker);
    }
  });

  it("treats notifications as best-effort and reports whether one was sent", () => {
    expect(fn).toContain("notification_sent");
    expect(fn).toContain("[manual-payment] activation notification failed");
    expect(fn).toContain("[manual-payment] rejection notification failed");
  });

  it("still gates admin_verify on admin or super_admin", () => {
    expect(fn).toContain('.in("role", ["admin", "super_admin"])');
    expect(fn).toContain("Admin access required");
  });

  it("does NOT change entitlement duration (30-day months preserved)", () => {
    // Out of scope for this authorisation: changing it would change how long a
    // paid package lasts.
    expect(fn).toContain("durationMonths * 30 * 86400 * 1000");
  });

  it("does NOT activate any payment method or read the pricing catalogue", () => {
    // Assert on real table access, not on prose: the inherited settlement
    // comment legitimately names pricing_settings while never querying it.
    expect(fn).not.toContain('.from("pricing_settings")');
    expect(fn).not.toContain("monthly_price");
    // payment_method_config is READ (to fetch instructions) but never written,
    // so no method can be enabled from here.
    expect(fn).toContain('.from("payment_method_config")');
    expect(fn).not.toMatch(/from\("payment_method_config"\)\s*\n?\s*\.(insert|update|upsert|delete)/);
  });
});

describe("FAZA 0 / V9a — ai-fraud-check authorization", () => {
  const fn = read("supabase/functions/ai-fraud-check/index.ts");

  it("requires a bearer token before doing any work", () => {
    expect(fn).toContain('req.headers.get("Authorization")');
    expect(fn).toContain('authHeader?.startsWith("Bearer ")');
    expect(fn).toContain("supabase.auth.getUser(");

    // The auth check must precede the body parse, so an unauthenticated caller
    // cannot reach any query at all.
    expect(fn.indexOf('req.headers.get("Authorization")')).toBeLessThan(
      fn.indexOf("const { payout_request_id } = await req.json()"),
    );
  });

  it("returns 401 when unauthenticated", () => {
    expect(fn).toMatch(/error: "Unauthorized"[\s\S]{0,80}status: 401/);
  });

  it("restricts writes to the partner owner or platform staff", () => {
    expect(fn).toContain('.in("role", ["admin", "super_admin"])');
    expect(fn).toContain("isPlatformStaff");
    expect(fn).toContain("isPartnerOwner");
    expect(fn).toMatch(/error: "Forbidden"[\s\S]{0,80}status: 403/);
  });

  it("authorizes BEFORE writing the fraud verdict", () => {
    expect(fn.indexOf("isPartnerOwner")).toBeLessThan(fn.indexOf("ai_fraud_score:"));
  });

  it("still reads the columns that actually exist on payout_requests", () => {
    // partner-payouts v50 drifted to available_balance/amount/status; this
    // function is the one aligned with the real schema. Keep it that way.
    expect(fn).toContain("payout.requested_amount");
    expect(fn).toContain("wallet?.current_balance");
    expect(fn).not.toContain("available_balance");
    expect(fn).not.toContain("pending_balance");
  });
});

describe("FAZA 0 / V9b — withdrawal_requests guard migration", () => {
  const sql = read(
    "supabase/migrations/20260915080000_faza0_v9b_withdrawal_requests_status_amount_guard.sql",
  );

  it("is marked prepared-not-applied", () => {
    expect(sql).toContain("PREPARED, NOT APPLIED");
  });

  it("constrains status to the five implemented values", () => {
    expect(sql).toContain("withdrawal_requests_status_check");
    for (const s of [
      "pending_ai_review",
      "pending_admin_review",
      "blocked",
      "approved",
      "rejected",
    ]) {
      expect(sql).toContain(`'${s}'`);
    }
  });

  it("rejects non-positive amounts", () => {
    expect(sql).toContain("withdrawal_requests_amount_positive");
    expect(sql).toContain("CHECK (amount > 0)");
  });

  it("forces the client's initial status and blocks client status changes", () => {
    expect(sql).toContain("NEW.status := 'pending_ai_review'");
    expect(sql).toContain("may only be changed by an administrator");
    expect(sql).toContain("trg_withdrawal_requests_guard_status");
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.withdrawal_requests");
  });

  it("exempts service_role, admin and super_admin", () => {
    expect(sql).toContain("'service_role'");
    expect(sql).toContain("has_role(auth.uid(), 'admin'::app_role)");
    expect(sql).toContain("has_role(auth.uid(), 'super_admin'::app_role)");
  });

  it("does not reuse the mis-attached function or disturb platform_withdrawal_requests", () => {
    // withdrawal_requests_enforce_initial_status() forces status := 'pending',
    // which is not in this table's vocabulary. It stays where it is.
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.withdrawal_requests_enforce_initial_status");
    expect(sql).not.toMatch(/(DROP|ALTER)\s+TRIGGER[^\n]*platform_withdrawal_requests/);
  });

  it("is non-destructive", () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });
});

describe("FAZA 0 / D14 — billing_history uniqueness migration", () => {
  const sql = read(
    "supabase/migrations/20260915080100_faza0_d14_billing_history_reference_unique.sql",
  );

  it("is marked prepared-not-applied and is additive only", () => {
    expect(sql).toContain("PREPARED, NOT APPLIED");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS billing_history_reference_id_unique");
    expect(sql).toContain("WHERE reference_id IS NOT NULL");
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
