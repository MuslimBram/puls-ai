import { supabase } from "@/integrations/supabase/client";
import type { EnforceLimitsResource } from "@/config/quotaRegistry";

/**
 * FAZA 1A — one place that calls `enforce-limits`, and one way of reading it.
 *
 * Until this file existed, three call sites each invoked the function and each
 * decided for itself what a refusal looked like. That was workable only because
 * the function answered every refusal with HTTP 200 and a `{ allowed: false }`
 * body: a caller that forgot to inspect `allowed` silently proceeded past the
 * limit. `enforce-limits` now answers a refusal with **403**, so the body
 * arrives on the error path instead, and every caller has to be updated in the
 * same change. Rather than update the same logic three times, it lives here.
 *
 * Both shapes are handled, deliberately:
 *   403 + body      the current contract
 *   200 + allowed:false   the deployed v52 contract
 *
 * The second is not dead code. During a deploy the browser may hold a session
 * against the old function for as long as the rollout takes, and a customer who
 * is at their limit must be refused by either version rather than let through by
 * the newer client.
 */

export type LimitScope = "workspace" | "user";

export interface LimitRefusal {
  readonly allowed: false;
  readonly error: string;
  readonly currentPlan?: string;
  readonly limit?: number;
  readonly current?: number;
  readonly scope?: LimitScope;
}

export interface LimitCheckOptions {
  /**
   * Resource the limit applies to, as `enforce-limits` names it. The union is
   * the registry's (FAZA 2): a name exists here only for a quota something
   * enforces, and nothing is typed by hand.
   */
  readonly resource: EnforceLimitsResource;
  /**
   * The workspace the write belongs to. Required for workspace-scoped
   * resources: without it the function falls back to the caller's own first
   * workspace, which is the wrong one whenever a member is acting inside
   * somebody else's workspace.
   */
  readonly workspaceId?: string | null;
  readonly action?: string;
}

/** Reads a refusal body off a non-2xx response, if that is what came back. */
async function refusalFromError(error: unknown): Promise<LimitRefusal | null> {
  const context = (error as { context?: unknown } | null | undefined)?.context;
  if (!context || typeof (context as Response).json !== "function") return null;
  try {
    const source = typeof (context as Response).clone === "function"
      ? (context as Response).clone()
      : (context as Response);
    const body = (await source.json()) as Partial<LimitRefusal> | null;
    if (body && body.allowed === false && typeof body.error === "string") {
      return body as LimitRefusal;
    }
  } catch {
    // Not JSON, or the body was already consumed. Fall through to the generic
    // message rather than inventing one.
  }
  return null;
}

/**
 * Throws with the server's own message when the plan does not allow the write.
 * Returns normally when it does.
 */
export async function assertWithinLimit(options: LimitCheckOptions): Promise<void> {
  const { resource, workspaceId, action = "add" } = options;

  const body: Record<string, unknown> = { action, resource };
  if (workspaceId) body.workspace_id = workspaceId;

  const { data, error } = await supabase.functions.invoke("enforce-limits", { body });

  if (error) {
    const refusal = await refusalFromError(error);
    if (refusal) throw new Error(refusal.error);
    throw new Error(error.message || "Failed to check limits");
  }

  // Legacy 200 + { allowed: false } — see the note at the top of this file.
  if (data && (data as Partial<LimitRefusal>).allowed === false) {
    throw new Error((data as LimitRefusal).error || "Plan limit reached. Please upgrade your plan.");
  }
}
