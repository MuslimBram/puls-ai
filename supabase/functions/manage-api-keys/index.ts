import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PERMISSIONS = new Set(["read", "write", "admin"]);

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  getServiceKey() ?? "",
  { auth: { persistSession: false } },
);

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  let key = "lp_";
  for (let i = 0; i < bytes.length; i++) key += chars.charAt(bytes[i] % chars.length);
  return key;
}

function requireWorkspaceId(body: Record<string, unknown>): string {
  const workspaceId = body.workspace_id;
  if (typeof workspaceId !== "string" || !UUID_RE.test(workspaceId)) {
    throw new Error("workspace_id is required");
  }
  return workspaceId;
}

async function requireWorkspaceAdmin(userId: string, workspaceId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_workspace_role_for_user", {
    _user_id: userId,
    _workspace_id: workspaceId,
    _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: owner or business admin role required");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Not authenticated");

    const token = authHeader.slice("Bearer ".length);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = body.action;
    const workspaceId = requireWorkspaceId(body);
    await requireWorkspaceAdmin(user.id, workspaceId);

    if (action === "create") {
      const permissions = Array.isArray(body.permissions) ? body.permissions : ["read", "write"];
      if (!permissions.length || permissions.some((value) => typeof value !== "string" || !ALLOWED_PERMISSIONS.has(value))) {
        throw new Error("Unsupported API key permissions");
      }

      const rateLimit = body.rate_limit == null ? 60 : Number(body.rate_limit);
      if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 60) {
        throw new Error("rate_limit must be an integer between 1 and 60");
      }

      const rawKey = generateApiKey();
      const keyHash = await hashKey(rawKey);
      const keyPrefix = rawKey.substring(0, 7) + "...";
      const label = typeof body.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 100)
        : "Default";

      const { data, error } = await supabaseAdmin.from("api_keys").insert({
        user_id: user.id,
        workspace_id: workspaceId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        label,
        permissions,
        rate_limit_per_minute: rateLimit,
      }).select(
        "id, workspace_id, key_prefix, label, permissions, is_active, last_used_at, usage_count, rate_limit_per_minute, created_at, revoked_at",
      ).single();

      if (error) throw error;
      return new Response(JSON.stringify({
        ...data,
        raw_key: rawKey,
        message: "Store this key securely — it won't be shown again.",
      }), { headers: { ...getCors(req), "Content-Type": "application/json" } });
    }

    if (action === "list") {
      const { data, error } = await supabaseAdmin.from("api_keys")
        .select("id, workspace_id, key_prefix, label, permissions, is_active, last_used_at, usage_count, rate_limit_per_minute, created_at, revoked_at")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ keys: data }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "revoke") {
      if (typeof body.key_id !== "string" || !UUID_RE.test(body.key_id)) throw new Error("key_id required");
      const { data, error } = await supabaseAdmin.from("api_keys").update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
        .eq("id", body.key_id)
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("API key not found in this workspace");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (action === "logs") {
      const { data: keys, error: keyError } = await supabaseAdmin.from("api_keys")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id);
      if (keyError) throw keyError;
      const keyIds = (keys ?? []).map((key) => key.id);
      if (!keyIds.length) {
        return new Response(JSON.stringify({ logs: [] }), {
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabaseAdmin.from("api_request_logs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .in("api_key_id", keyIds)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return new Response(JSON.stringify({ logs: data }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action. Use: create, list, revoke, logs");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Not authenticated" ? 401 : message.startsWith("Forbidden:") ? 403 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
