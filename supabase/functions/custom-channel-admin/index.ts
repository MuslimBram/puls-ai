import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient } from "../_shared/admin-client.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const getCors = (req: Request) => buildCorsHeaders(req);

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const admin = createAdminClient();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Authentication required" }, 401);

    const token = authHeader.slice("Bearer ".length);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json(req, { error: "Authentication required" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json(req, { error: "Invalid request body" }, 400);

    const { action, workspace_id } = body as Record<string, unknown>;

    if (typeof workspace_id !== "string" || !workspace_id) {
      return json(req, { error: "workspace_id is required" }, 400);
    }

    const { data: allowed, error: roleError } = await admin.rpc("has_workspace_role_for_user", {
      _user_id: authData.user.id,
      _workspace_id: workspace_id,
      _roles: ["owner", "admin"],
    });
    if (roleError) throw roleError;
    if (!allowed) return json(req, { error: "Workspace owner/admin access required" }, 403);

    switch (action) {
      case "list": {
        const { data, error } = await admin
          .from("custom_channel_adapters")
          .select("id,workspace_id,adapter_name,adapter_key,provider_api_url,auth_type,inbound_mapping,outbound_mapping,is_active,created_by,created_at,updated_at")
          .eq("workspace_id", workspace_id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json(req, { adapters: data ?? [] });
      }

      case "upsert": {
        const { id, adapter_name, adapter_key, provider_api_url, auth_type, auth_credentials, inbound_mapping, outbound_mapping } =
          body as Record<string, unknown>;

        if (typeof adapter_name !== "string" || !adapter_name.trim()) {
          return json(req, { error: "adapter_name is required" }, 400);
        }
        if (typeof adapter_key !== "string" || !/^[a-z0-9-]+$/.test(adapter_key)) {
          return json(req, { error: "adapter_key must contain only lowercase letters, numbers, and hyphens" }, 400);
        }

        const payload: Record<string, unknown> = {
          adapter_name: (adapter_name as string).trim(),
          adapter_key: (adapter_key as string).trim(),
          provider_api_url: typeof provider_api_url === "string" ? provider_api_url.trim() || null : null,
          auth_type: typeof auth_type === "string" ? auth_type : "none",
          inbound_mapping: inbound_mapping ?? {},
          outbound_mapping: outbound_mapping ?? {},
          updated_at: new Date().toISOString(),
        };

        if (auth_credentials && typeof auth_credentials === "object" &&
          Object.values(auth_credentials as Record<string, string>).some((v) => v)) {
          payload.auth_credentials = auth_credentials;
        }

        if (id && typeof id === "string") {
          const { error } = await admin
            .from("custom_channel_adapters")
            .update(payload)
            .eq("id", id)
            .eq("workspace_id", workspace_id);
          if (error) throw error;
          return json(req, { success: true });
        } else {
          const { error: dupError, data: existing } = await admin
            .from("custom_channel_adapters")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("adapter_key", (adapter_key as string).trim())
            .maybeSingle();
          if (dupError) throw dupError;
          if (existing) return json(req, { error: "This adapter key already exists. Choose a unique key." }, 409);

          const { error } = await admin.from("custom_channel_adapters").insert({
            ...payload,
            workspace_id,
            created_by: authData.user.id,
          });
          if (error) throw error;
          return json(req, { success: true });
        }
      }

      case "delete": {
        const { id } = body as Record<string, unknown>;
        if (typeof id !== "string" || !id) return json(req, { error: "id is required" }, 400);
        const { error } = await admin
          .from("custom_channel_adapters")
          .delete()
          .eq("id", id)
          .eq("workspace_id", workspace_id);
        if (error) throw error;
        return json(req, { success: true });
      }

      case "toggle": {
        const { id, is_active } = body as Record<string, unknown>;
        if (typeof id !== "string" || !id) return json(req, { error: "id is required" }, 400);
        if (typeof is_active !== "boolean") return json(req, { error: "is_active must be a boolean" }, 400);
        const { error } = await admin
          .from("custom_channel_adapters")
          .update({ is_active, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("workspace_id", workspace_id);
        if (error) throw error;
        return json(req, { success: true });
      }

      case "list_logs": {
        const { data, error } = await admin
          .from("integration_event_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return json(req, { logs: data ?? [] });
      }

      default:
        return json(req, { error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[custom-channel-admin]", err);
    return json(req, { error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
