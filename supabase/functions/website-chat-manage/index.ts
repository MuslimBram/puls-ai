import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { normalizeAllowedWebchatOrigins } from "../_shared/webchat-channel-validator.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...getCors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function enforceChannelLimit(authHeader: string): Promise<{ allowed: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return { allowed: false, error: "Channel limit service unavailable" };

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/enforce-limits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: anonKey,
      },
      body: JSON.stringify({ action: "add", resource: "channels" }),
    });
    if (!response.ok) return { allowed: false, error: "Channel limit check failed" };
    const body = await response.json().catch(() => ({})) as { allowed?: boolean; error?: string };
    return body.allowed === true
      ? { allowed: true }
      : { allowed: false, error: body.error || "Channel limit reached" };
  } catch {
    return { allowed: false, error: "Channel limit check failed" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

  const serviceKey = getServiceKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!serviceKey || !supabaseUrl) return json(req, { error: "Service unavailable" }, 503);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { data: { user }, error: userError } = await admin.auth.getUser(authHeader.slice(7));
    if (userError || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "status");
    const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
    if (!workspaceId) return json(req, { error: "workspace_id required" }, 400);

    const [{ data: member, error: memberError }, { data: owned, error: ownerError }] = await Promise.all([
      admin.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
      admin.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (memberError || ownerError) return json(req, { error: "Workspace authorization unavailable" }, 503);
    if (!member && !owned) return json(req, { error: "Forbidden" }, 403);

    const { data: existing, error: existingError } = await admin
      .from("channels")
      .select("id,is_enabled,connection_status,settings,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("channel_type", "website_chat")
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    if (action === "status") {
      if (!existing) return json(req, { configured: false });
      const settings = existing.settings && typeof existing.settings === "object" && !Array.isArray(existing.settings)
        ? existing.settings as Record<string, unknown>
        : {};
      const normalized = normalizeAllowedWebchatOrigins(settings.allowed_origins);
      return json(req, {
        configured: true,
        channel_id: existing.id,
        is_enabled: existing.is_enabled,
        connection_status: existing.connection_status,
        updated_at: existing.updated_at,
        allowed_origins: normalized.ok ? normalized.origins : [],
        configuration_valid: normalized.ok,
      });
    }

    if (action !== "save") return json(req, { error: "Unknown action" }, 400);

    const normalized = normalizeAllowedWebchatOrigins(body.allowed_origins);
    if (!normalized.ok) return json(req, { error: normalized.error }, 400);

    if (!existing) {
      const limit = await enforceChannelLimit(authHeader);
      if (!limit.allowed) return json(req, { error: limit.error || "Channel limit reached" }, 409);
    }

    const canonical = {
      channel_type: "website_chat",
      channel_name: "Website Chat",
      workspace_id: workspaceId,
      category: "web",
      is_enabled: true,
      connection_status: "connected",
      connection_mode: "professional",
      account_type: "business",
      capabilities: ["messaging", "inbox", "notifications"],
      provider_metadata: {},
      settings: { allowed_origins: normalized.origins },
      credentials_encrypted: {},
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    let channelId: string;
    if (existing?.id) {
      const { data: updated, error } = await admin
        .from("channels")
        .update(canonical)
        .eq("id", existing.id)
        .eq("workspace_id", workspaceId)
        .select("id")
        .single();
      if (error || !updated) throw error || new Error("Website Chat update failed");
      channelId = updated.id;
    } else {
      const { data: created, error } = await admin
        .from("channels")
        .insert({ ...canonical, user_id: user.id })
        .select("id")
        .single();
      if (error || !created) throw error || new Error("Website Chat creation failed");
      channelId = created.id;
    }

    return json(req, {
      ok: true,
      channel_id: channelId,
      allowed_origins: normalized.origins,
      install_required: true,
    });
  } catch (error) {
    console.error("[WEBSITE-CHAT-MANAGE]", error instanceof Error ? error.message : "unknown");
    return json(req, { error: "Website Chat setup failed" }, 500);
  }
});
