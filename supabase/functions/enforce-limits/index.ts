import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { loadCallerRoles, staffRolesOf } from "../_shared/platform-roles.ts";
import { resolveGoverningWorkspace, resolvePlanKey } from "../_shared/plan-limits.ts";
import { loadQuotaLimits, quotaLimitFor } from "../_shared/quota-limits.ts";
import { isWorkspaceScopedResource, quotaForResource } from "../_shared/quota-registry.runtime.ts";

/**
 * enforce-limits
 *
 * FAZA 1A changes, on top of deployed v52:
 *
 *  1. Roles and plan resolution now come from _shared/. v52 carried its own
 *     copies; three sibling functions carried different copies and drifted.
 *
 *  2. SCOPE (owner decision V-4): `channels` and `team_members` are counted
 *     PER WORKSPACE, not per user. v52 counted channels with
 *     `.eq("user_id", user.id)` while the RLS insert policy was
 *     workspace-scoped — the two layers disagreed about what the limit meant.
 *     Workspace is the unit of business, so the governing plan is the
 *     subscription of `workspaces.owner_id`.
 *
 *  3. NEW `team_members` branch. v52 loaded `team_members_limit` into its
 *     limits map and then never used it: there was no branch and no caller, so
 *     the users limit was decorative.
 *
 * Tenant safety: a caller who names a workspace must be a member of it. That is
 * checked through the existing SECURITY DEFINER helper
 * `has_workspace_role_for_user`; no new SECURITY DEFINER function is added and
 * RLS is not bypassed.
 *
 *  4. STATUS CODES. A refusal is now HTTP 403, carrying the same JSON body it
 *     always did: `{ allowed: false, error, currentPlan, limit, current, scope }`.
 *
 *     v52 answered every refusal with HTTP 200. A caller that checked only
 *     `res.ok`, or that read `data` without inspecting `allowed`, therefore read
 *     "limit reached" as "go ahead" — the function said no and the client heard
 *     yes. Two of the three call sites did inspect `allowed`; none of them could
 *     have been relied on to, because nothing in the contract made a refusal
 *     distinguishable from success at the transport level.
 *
 *     403 is the correct code: the request was understood and authenticated, and
 *     the plan does not permit it. 200 is reserved for `{ allowed: true }`, and
 *     500 stays for a genuine failure to decide.
 *
 *     Every call site now goes through `src/lib/enforceLimits.ts`, which reads
 *     the body from either status and raises the server's own message.
 *
 * FAZA 2 changes, on top of deployed v53:
 *
 *  5. LIMITS COME FROM THE REGISTRY. The catalogue read, the resource names
 *     and the workspace/user scope are derived from
 *     `_shared/quota-registry.runtime.ts` through `_shared/quota-limits.ts`.
 *     Nothing in this file names a pricing_settings column any more.
 *
 *  6. `leads` is WORKSPACE-SCOPED and counts real rows. v53 compared
 *     `subscriptions.leads_used`, a counter only email-poll ever incremented
 *     and nothing ever reset (reset_monthly_usage() is scheduled by no cron
 *     job). The count now comes from `public.leads_used_this_month(workspace)`
 *     — the same SQL the Faza 2 trigger on `leads` uses, so this branch and
 *     the trigger cannot disagree. The branch still has no caller (leads are
 *     created server-side); the trigger is the gate.
 *
 *  7. NEW `automation_rules` branch, counting `automation_workflows` per
 *     workspace, with a live caller in `src/hooks/useAutomations.ts` and a
 *     BEFORE INSERT trigger behind it.
 *
 *  8. An UNKNOWN resource is refused (400, allowed:false). v53 fell through
 *     every branch and answered `{ allowed: true }` — a typo in a resource name
 *     was an approval.
 */

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", getServiceKey() ?? "", {
    auth: { persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const [body, roles] = await Promise.all([
      req.json(),
      loadCallerRoles(supabase, user.id),
    ]);
    const { action, resource, workspace_id: requestedWorkspaceId } = body ?? {};

    const bypassRoles = staffRolesOf(roles);
    if (bypassRoles.length > 0) {
      return json(req, {
        allowed: true,
        currentPlan: "enterprise",
        bypassed: true,
        bypass_roles: bypassRoles,
      });
    }

    // Vocabulary is the registry's, not the caller's. A resource the registry
    // does not enforce has no limit to read, so it cannot be approved either.
    if (typeof resource !== "string" || !quotaForResource(resource)) {
      return json(req, { allowed: false, error: `Unknown resource: ${String(resource)}` }, 400);
    }

    const quotaLimits = await loadQuotaLimits(supabase);

    // Whose subscription governs this check?
    let governedUserId = user.id;
    let workspaceId: string | null = null;

    if (isWorkspaceScopedResource(resource)) {
      const ws = await resolveGoverningWorkspace(supabase, user.id, requestedWorkspaceId);
      if (!ws) {
        return json(req, { allowed: false, error: "No accessible workspace for this request." }, 403);
      }
      workspaceId = ws.workspaceId;
      governedUserId = ws.ownerId;
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, ai_replies_today, ai_replies_reset_at, subscription_status, grace_period_end, trial_end")
      .eq("user_id", governedUserId)
      .maybeSingle();

    const effectivePlan = resolvePlanKey(sub);
    const limit = quotaLimitFor(quotaLimits, effectivePlan, resource);

    /** A quota refusal is an error, not a successful "no". See STATUS CODES above. */
    const refuse = (error: string, limit: number, current: number) =>
      json(req, { allowed: false, error, currentPlan: effectivePlan, limit, current, scope: workspaceId ? "workspace" : "user" }, 403);

    /** Live row count for a workspace-scoped table. */
    const countWorkspaceRows = async (table: string): Promise<number> => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(`${table} count failed: ${error.message}`);
      return count || 0;
    };

    if (resource === "channels") {
      const count = await countWorkspaceRows("channels");
      if (limit !== -1 && count >= limit) {
        return refuse(`Channel limit reached (${count}/${limit}). Upgrade to add more channels.`, limit, count);
      }
    }

    if (resource === "team_members") {
      const count = await countWorkspaceRows("workspace_members");
      if (limit !== -1 && count >= limit) {
        return refuse(`Team member limit reached (${count}/${limit}). Upgrade to add more members.`, limit, count);
      }
    }

    if (resource === "automation_rules") {
      const count = await countWorkspaceRows("automation_workflows");
      if (limit !== -1 && count >= limit) {
        return refuse(`Automation rule limit reached (${count}/${limit}). Upgrade to add more automation rules.`, limit, count);
      }
    }

    if (resource === "keywords") {
      const { count, error } = await supabase
        .from("keywords")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (error) throw new Error(`keywords count failed: ${error.message}`);
      if (limit !== -1 && (count || 0) >= limit) {
        return refuse(`Keyword limit reached (${count}/${limit}). Upgrade to add more keywords.`, limit, count || 0);
      }
    }

    if (resource === "leads") {
      // One implementation of "leads used this month": the SQL function the
      // trigger on `leads` calls. Not subscriptions.leads_used — see note 6.
      const { data: used, error } = await supabase.rpc("leads_used_this_month", { _workspace_id: workspaceId });
      if (error) throw new Error(`leads_used_this_month failed: ${error.message}`);
      const current = typeof used === "number" ? used : 0;
      if (limit !== -1 && current >= limit) {
        return refuse(`Monthly lead limit reached (${current}/${limit}). Upgrade for more leads.`, limit, current);
      }
    }

    if (resource === "ai_replies") {
      const used = sub?.ai_replies_today || 0;
      const resetAt = sub?.ai_replies_reset_at ? new Date(sub.ai_replies_reset_at) : new Date(0);
      const now = new Date();
      const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);
      const effectiveUsed = hoursSinceReset >= 24 ? 0 : used;

      if (limit !== -1 && effectiveUsed >= limit) {
        return refuse(`Daily AI reply limit reached (${effectiveUsed}/${limit}). Upgrade for more AI replies.`, limit, effectiveUsed);
      }

      if (action === "increment") {
        const patch = hoursSinceReset >= 24
          ? { ai_replies_today: 1, ai_replies_reset_at: now.toISOString() }
          : { ai_replies_today: effectiveUsed + 1 };
        const { error } = await supabase.from("subscriptions").update(patch).eq("user_id", user.id);
        if (error) throw new Error(`ai reply counter update failed: ${error.message}`);
      }
    }

    return json(req, { allowed: true, currentPlan: effectivePlan, scope: workspaceId ? "workspace" : "user" });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
