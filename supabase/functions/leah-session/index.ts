import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";
import { randomSessionToken, sha256Hex } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_TTL_MS = 60 * 60 * 1000;
const HANDOFF_TTL_MS = 60 * 1000;
const ACTIVE_ENTITLEMENT_STATUSES = new Set(["trial", "active", "grace"]);
const ADMIN_ROLES = new Set(["owner", "admin", "super_admin"]);

const admin = createAdminClient();
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
  });
}

function publicError(message: string, status: number): string {
  if (status === 500) return "Internal LEAH session error";
  if (message === "Not authenticated") return message;
  return message;
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
    const mode = body.mode === undefined ? "direct" : body.mode;
    if (mode !== "direct" && mode !== "handoff") throw new Error("Invalid LEAH session mode");

    const { data: hasAccess, error: accessError } = await admin.rpc("has_workspace_role_for_user", {
      _user_id: user.id,
      _workspace_id: workspaceId,
      _roles: ["owner", "admin", "member"],
    });
    if (accessError) throw accessError;
    if (!hasAccess) return json(req, { error: "Workspace access denied" }, 403);

    const { data: role, error: roleError } = await admin.rpc("leah_role_for_user", {
      _user_id: user.id,
      _workspace_id: workspaceId,
    });
    if (roleError) throw roleError;
    if (!role) return json(req, { error: "Workspace access denied" }, 403);

    const isAdmin = ADMIN_ROLES.has(role);
    const { data: entitlement, error: entitlementError } = await admin
      .from("leah_workspace_entitlements")
      .select("status, valid_until, concurrency_limit, included_monthly_tokens, storage_bytes_limit")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (entitlementError) throw entitlementError;

    if (!isAdmin) {
      if (!entitlement || !ACTIVE_ENTITLEMENT_STATUSES.has(entitlement.status)) {
        return json(req, { error: "LEAH entitlement is not active" }, 403);
      }
      if (entitlement.valid_until && Date.parse(entitlement.valid_until) <= Date.now()) {
        return json(req, { error: "LEAH entitlement has expired" }, 403);
      }
    }

    const now = new Date().toISOString();
    const limits = {
      concurrency: entitlement?.concurrency_limit ?? null,
      included_monthly_tokens: entitlement?.included_monthly_tokens ?? null,
      storage_bytes: entitlement?.storage_bytes_limit ?? null,
    };

    if (mode === "handoff") {
      const { error: cleanupError } = await admin
        .from("leah_handoff_tickets")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .lt("expires_at", now);
      if (cleanupError) throw cleanupError;

      const rawCode = randomSessionToken();
      const codeHash = await sha256Hex(rawCode);
      const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
      const { data: ticket, error: ticketError } = await admin
        .from("leah_handoff_tickets")
        .insert({
          workspace_id: workspaceId,
          user_id: user.id,
          code_hash: codeHash,
          expires_at: expiresAt,
        })
        .select("id, expires_at")
        .single();
      if (ticketError) throw ticketError;

      return json(req, {
        mode: "handoff",
        handoff_code: rawCode,
        handoff_id: ticket.id,
        workspace_id: workspaceId,
        role,
        expires_at: ticket.expires_at,
        limits,
      });
    }

    const rawToken = randomSessionToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    const { error: expiredCleanupError } = await admin
      .from("leah_access_sessions")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .lt("expires_at", now);
    if (expiredCleanupError) throw expiredCleanupError;

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
      mode: "direct",
      session_token: rawToken,
      session_id: session.id,
      workspace_id: workspaceId,
      role,
      expires_at: session.expires_at,
      limits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Not authenticated" ? 401 :
      message.includes("access denied") || message.includes("Workspace access") ? 403 :
      message.includes("required") || message.includes("Invalid") ? 400 : 500;
    return json(req, { error: publicError(message, status) }, status);
  }
});
