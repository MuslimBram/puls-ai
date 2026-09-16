/**
 * _shared/plan-limits.ts
 *
 * FAZA 1A — the single source of truth for "what limit applies to this account".
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * The same plan yielded DIFFERENT limits depending on which function was called,
 * because two functions read the catalogue and two carried hard-coded tables:
 *
 *   plan          pricing_settings   ai-router   enforce-limits   generate-reply
 *   standard      25                 25          25               20   <- wrong
 *   professional  75                 75          75               100  <- wrong
 *   advanced      200                200         200              500  <- wrong
 *
 * generate-reply v50 and dedicated-ai-reply v50 never read `pricing_settings` at
 * all, so any limit an operator set in the admin panel was inert for half the AI
 * surface. This module makes the catalogue the only source.
 *
 * ── Scope rule (owner decision V-4, 2026-09-15) ──────────────────────────────
 * Per-WORKSPACE limits: channels, team members.
 * Per-USER limits:      AI replies, keywords, leads (they track a user counter).
 *
 * Workspace is the unit of business in a multi-tenant product, so a workspace's
 * governing plan is the subscription of `workspaces.owner_id` — not of whichever
 * member happens to be making the request.
 */

/** Lowest publicly sold plan. Used when an account has no subscription row. */
export const FALLBACK_PLAN_KEY = "standard";

/**
 * Legacy plan aliases, unioned from every function that had its own map:
 *   ai-router          { free -> standard, basic -> standard }
 *   enforce-limits     { free -> standard, pro  -> professional }
 *   generate-reply     { free -> standard, pro  -> professional }
 * The union is a superset of all three, so no path loses behaviour.
 */
export const PLAN_ALIASES: Record<string, string> = {
  free: "standard",
  basic: "standard",
  pro: "professional",
};

export interface PlanLimits {
  channels: number;
  keywords: number;
  aiRepliesPerDay: number;
  leadsPerMonth: number;
  teamMembers: number;
}

export interface SubscriptionShape {
  plan?: string | null;
  subscription_status?: string | null;
  grace_period_end?: string | null;
  trial_end?: string | null;
}

/**
 * Downgrade rules for a subscription that is no longer in good standing.
 * Preserved verbatim from enforce-limits v52 — this is the ONLY implementation.
 * Duplicating it (in SQL, or in another function) is how the limit tables
 * diverged in the first place.
 */
export function getEffectivePlan(
  plan: string,
  status: string,
  gracePeriodEnd: string | null | undefined,
  trialEnd: string | null | undefined,
): string {
  const now = new Date();

  if (trialEnd && new Date(trialEnd) < now && status === "trialing") return FALLBACK_PLAN_KEY;
  if (status === "past_due") return gracePeriodEnd && new Date(gracePeriodEnd) > now ? plan : FALLBACK_PLAN_KEY;
  if (["canceled", "unpaid"].includes(status)) return FALLBACK_PLAN_KEY;
  return plan;
}

/**
 * Resolve the plan key that governs a subscription row.
 *
 * A MISSING row resolves to the lowest plan, never to "unlimited". ai-router v65
 * wrapped its whole quota block in `if (sub)`, so an account with no
 * subscriptions row was neither limited nor metered — this closes that.
 */
export function resolvePlanKey(sub: SubscriptionShape | null | undefined): string {
  const raw = sub?.plan || FALLBACK_PLAN_KEY;
  const normalized = PLAN_ALIASES[raw] || raw;
  const status = sub?.subscription_status || "active";
  return getEffectivePlan(normalized, status, sub?.grace_period_end, sub?.trial_end);
}

/** Load every plan's limits from the catalogue. Throws rather than guessing. */
export async function loadPlanLimits(sb: any): Promise<Record<string, PlanLimits>> {
  const { data, error } = await sb
    .from("pricing_settings")
    .select("plan_key, channels_limit, keywords_limit, ai_replies_per_day_limit, leads_per_month_limit, team_members_limit")
    .eq("is_donation", false);
  if (error) throw new Error(`pricing_settings read failed: ${error.message}`);

  const map: Record<string, PlanLimits> = {};
  for (const row of data ?? []) {
    map[row.plan_key] = {
      channels: row.channels_limit ?? -1,
      keywords: row.keywords_limit ?? -1,
      aiRepliesPerDay: row.ai_replies_per_day_limit ?? -1,
      leadsPerMonth: row.leads_per_month_limit ?? -1,
      teamMembers: row.team_members_limit ?? -1,
    };
  }
  return map;
}

/** Pick one plan's limits, falling back to the lowest plan rather than to unlimited. */
export function limitsForPlan(all: Record<string, PlanLimits>, planKey: string): PlanLimits {
  return all[planKey] ?? all[FALLBACK_PLAN_KEY] ?? {
    channels: 0, keywords: 0, aiRepliesPerDay: 0, leadsPerMonth: 0, teamMembers: 0,
  };
}

/**
 * Daily AI reply limit for one plan, straight from the catalogue.
 *
 * Fallback chain preserved from ai-router v65 — the only path that had it right:
 *   exact plan_key row  ->  the `standard` row  ->  literal 50
 * The literal is a last resort for a catalogue that returns nothing at all; it is
 * NOT a per-plan table, which is precisely what went wrong in the two AI reply
 * functions.
 */
export async function resolveAiReplyLimit(sb: any, planKey: string): Promise<number> {
  const { data: exact } = await sb
    .from("pricing_settings")
    .select("ai_replies_per_day_limit")
    .eq("plan_key", planKey)
    .maybeSingle();

  let row = exact;
  if (!row) {
    const { data: fallback } = await sb
      .from("pricing_settings")
      .select("ai_replies_per_day_limit")
      .eq("plan_key", FALLBACK_PLAN_KEY)
      .maybeSingle();
    row = fallback;
  }
  return row?.ai_replies_per_day_limit ?? 50;
}

/**
 * The workspace whose plan governs a request, and the user who pays for it.
 *
 * TENANT SAFETY: membership is checked through the existing SECURITY DEFINER
 * helper `has_workspace_role_for_user`, which already covers owners, members and
 * time-bounded access assignments. No new SECURITY DEFINER function is
 * introduced, and RLS is not bypassed — a caller who is not a member of the
 * workspace they name is refused.
 */
export async function resolveGoverningWorkspace(
  sb: any,
  userId: string,
  requestedWorkspaceId?: string | null,
): Promise<{ workspaceId: string; ownerId: string } | null> {
  let workspaceId = requestedWorkspaceId ?? null;

  if (workspaceId) {
    const { data: allowed, error } = await sb.rpc("has_workspace_role_for_user", {
      _user_id: userId,
      _workspace_id: workspaceId,
      _roles: ["owner", "admin", "member"],
    });
    if (error) throw new Error(`workspace membership check failed: ${error.message}`);
    if (!allowed) return null;
  } else {
    const { data: sub } = await sb
      .from("subscriptions")
      .select("workspace_id")
      .eq("user_id", userId)
      .maybeSingle();
    workspaceId = sub?.workspace_id ?? null;

    if (!workspaceId) {
      const { data: owned } = await sb
        .from("workspaces")
        .select("id")
        .eq("owner_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      workspaceId = owned?.id ?? null;
    }
    if (!workspaceId) return null;
  }

  const { data: ws, error: wsError } = await sb
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (wsError) throw new Error(`workspace read failed: ${wsError.message}`);
  if (!ws) return null;

  return { workspaceId: ws.id, ownerId: ws.owner_id };
}
