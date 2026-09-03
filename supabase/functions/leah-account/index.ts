import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";
import { rejectWorkspaceInjection, resolveLeahSession } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const admin = createAdminClient();
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function requireWorkspaceAdmin(userId: string, workspaceId: string): Promise<void> {
  const { data, error } = await admin.rpc("has_workspace_role_for_user", {
    _user_id: userId,
    _workspace_id: workspaceId,
    _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: LEAH workspace admin required");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const session = await resolveLeahSession(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    rejectWorkspaceInjection(body);
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (action === "usage.summary") {
      await requireWorkspaceAdmin(session.userId, session.workspaceId);
      const { data, error } = await admin.rpc("leah_usage_summary", { _workspace_id: session.workspaceId });
      if (error) throw error;
      if (!data) throw new Error("LEAH entitlement not found");
      return json(req, { usage: data });
    }

    if (action === "entitlement.get") {
      const { data, error } = await admin.from("leah_workspace_entitlements")
        .select("entitlement_key,status,source,valid_until,concurrency_limit,included_monthly_tokens,storage_bytes_limit,included_monthly_deploys,ai_funding_mode,metered_overage_enabled,deploy_overage_enabled,storage_overage_enabled,updated_at")
        .eq("workspace_id", session.workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("LEAH entitlement not found");
      return json(req, { entitlement: data });
    }

    throw new Error("Unknown LEAH account action");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "LEAH session required" || message === "LEAH session invalid or expired" ? 401 :
      message.startsWith("Forbidden") || message.includes("access revoked") || message.includes("entitlement inactive") || message.includes("entitlement expired") ? 403 :
      message.toLowerCase().includes("not found") ? 404 :
      message.includes("workspace_id") || message.startsWith("Unknown") ? 400 : 500;
    return json(req, { error: status === 500 ? "Internal LEAH account error" : message }, status);
  }
});
