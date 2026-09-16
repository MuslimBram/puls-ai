/**
 * _shared/quota-limits.ts
 *
 * FAZA 2 — the catalogue read for every numeric quota, driven by the registry.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * `plan-limits.ts` (Faza 1A) reads five hand-listed columns into a hand-typed
 * `PlanLimits`. Faza 2 enforces two more quotas, and the next phase will enforce
 * more. Adding a column by hand to a select string and a field by hand to an
 * interface is exactly the copying the owner ruled out ("mos kopjo manualisht
 * registry/limits"), so this module derives BOTH from the generated runtime
 * registry: the select list is `QUOTA_COLUMNS`, the result is keyed by the
 * registry key, and a limit that is not in the registry cannot be read here.
 *
 * `plan-limits.ts` is left byte-identical on purpose: it is bundled into five
 * deployed functions (manage-api-keys, public-api, enforce-limits,
 * generate-reply, dedicated-ai-reply) and touching it would put all five into
 * drift. Its `loadPlanLimits`/`limitsForPlan` pair now has no importer; removing
 * it is bundled with the next change that has to touch that file anyway.
 *
 * Plan resolution is NOT reimplemented here. The plan key still comes from
 * `resolvePlanKey()` in plan-limits.ts, the single TypeScript implementation,
 * which the SQL `effective_plan_for_user()` mirrors.
 */

import { FALLBACK_PLAN_KEY } from "./plan-limits.ts";
import { QUOTA_COLUMNS, RUNTIME_QUOTAS, quotaForResource } from "./quota-registry.runtime.ts";

/** One plan's limits, keyed by registry key (channels, keywords, leadsPerMonth, …). */
export type QuotaLimits = Readonly<Record<string, number>>;

/** Load every plan's limits from the catalogue in one read. Throws rather than guessing. */
export async function loadQuotaLimits(sb: any): Promise<Record<string, QuotaLimits>> {
  const { data, error } = await sb
    .from("pricing_settings")
    .select(["plan_key", ...QUOTA_COLUMNS].join(", "))
    .eq("is_donation", false);
  if (error) throw new Error(`pricing_settings read failed: ${error.message}`);

  const map: Record<string, QuotaLimits> = {};
  for (const row of data ?? []) {
    const limits: Record<string, number> = {};
    for (const quota of RUNTIME_QUOTAS) {
      const raw = row[quota.column];
      // A NULL catalogue cell means "not set", and not-set must never mean
      // "unlimited"; the fallback rule below sends it to the lowest plan.
      limits[quota.key] = typeof raw === "number" ? raw : Number.NaN;
    }
    map[row.plan_key] = limits;
  }
  return map;
}

/**
 * The limit for one resource under one plan.
 *
 * Fallback chain, preserved from Faza 1A: an unknown plan key reads the
 * `standard` row, and a missing cell reads the `standard` cell. Neither ever
 * yields -1 by accident — unlimited is a value the catalogue has to state.
 * Returns 0 (refuse everything) when the catalogue has nothing at all, which is
 * the fail-closed answer and matches limitsForPlan()'s empty fallback.
 */
export function quotaLimitFor(all: Record<string, QuotaLimits>, planKey: string, resource: string): number {
  const quota = quotaForResource(resource);
  if (!quota) throw new Error(`unknown enforce-limits resource: ${resource}`);

  const own = all[planKey]?.[quota.key];
  if (typeof own === "number" && Number.isFinite(own)) return own;

  const fallback = all[FALLBACK_PLAN_KEY]?.[quota.key];
  if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;

  return 0;
}
