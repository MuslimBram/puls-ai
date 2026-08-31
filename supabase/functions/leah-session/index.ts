import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";
import { randomSessionToken, sha256Hex } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ACTIVE_ENTITLEMENT_STATUSES = new Set(["trial", "active", "grace"]);

const admin = createAdminClient();
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Not authenticated");

    const jwt = authHeader.slice("Bearer ".length);
    const { data: { user }, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !user) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = body.workspace_id;
    if (typeof workspaceId !== "string" || !UUID_RE.test(workspaceId)) {
      throw new Error("workspace_id is required for session issuance");
    }

    const { data: hasAccess, error: accessError } = await admin.rpc("has_workspace_role_for_user", {
      _user_id: user.id,
      _workspace_id: workspaceId,
      _roles: ["owner", "admin", "member"],
    });
    if (accessError) throw accessError;
    if (!hasAccess) return json(req, { error: "Workspace access denied" }, 403);

    const { data: entitlement, error: entitlementError } = await admin
      .from("leah_workspace_entitlements")
      .select("status, valid_until, concurrency_limit, included_monthly_tokens, storage_bytes_limit")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (entitlementError) throw entitlementError;
    if (!entitlement || !ACTIVE_ENTITLEMENT_STATUSES.has(entitlement.status)) {
      return json(req, { error: "LEAH entitlement is not active" }, 403);
    }
    if (entitlement.valid_until && Date.parse(entitlement.valid_until) <= Date.now()) {
      return json(req, { error: "LEAH entitlement has expired" }, 403);
    }

    const rawToken = randomSessionToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    // Clean only expired sessions for this same principal/workspace. Active sessions
    // are intentionally allowed so multiple devices do not revoke each other.
    const now = new Date().toISOString();
    const { error: cleanupError } = await admin
      .from("leah_access_sessions")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .lt("expires_at", now);
    if (cleanupError) throw cleanupError;

    const { data: session, error: insertError } = await admin
      .from("leah_access_sessions")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();
    if (insertError) throw insertError;

    return json(req, {
      session_token: rawToken,
      session_id: session.id,
      workspace_id: workspaceId,
      expires_at: session.expires_at,
      limits: {
        concurrency: entitlement.concurrency_limit,
        included_monthly_tokens: entitlement.included_monthly_tokens,
        storage_bytes: entitlement.storage_bytes_limit,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Not authenticated" ? 401 :
      message.includes("required") ? 400 : 500;
    return json(req, { error: message }, status);
  }
});
