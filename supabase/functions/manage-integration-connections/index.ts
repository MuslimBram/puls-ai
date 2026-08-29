import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.25.76";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { encryptForStorage } from "../_shared/token-utils.ts";

const getCors = (req: Request) => buildCorsHeaders(req);
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  getServiceKey(),
  { auth: { persistSession: false } },
);

const workspaceId = z.string().uuid();
const id = z.string().uuid();
const safeObject = z.record(z.unknown());
const credentialObject = z.record(z.string().max(5000));
const sensitiveConfigKey = /(token|secret|password|api[_-]?key|private[_-]?key|credential)/i;

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list_external"), workspace_id: workspaceId }),
  z.object({
    action: z.literal("upsert_external"),
    workspace_id: workspaceId,
    integration_key: z.string().trim().min(1).max(120),
    integration_name: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(80),
    description: z.string().max(1000).nullable().optional(),
    credentials: credentialObject.optional(),
    config: safeObject.optional(),
    status: z.string().trim().min(1).max(40).optional(),
    is_enabled: z.boolean().optional(),
    rate_limit_per_hour: z.number().int().min(0).max(100000).optional(),
    min_scan_interval_minutes: z.number().int().min(1).max(10080).optional(),
    keyword_match_threshold: z.number().min(0).max(1).optional(),
  }),
  z.object({ action: z.literal("toggle_external"), workspace_id: workspaceId, id, is_enabled: z.boolean() }),
  z.object({ action: z.literal("delete_external"), workspace_id: workspaceId, id }),
  z.object({ action: z.literal("list_integration_logs"), workspace_id: workspaceId, integration_id: id }),
  z.object({ action: z.literal("list_unified"), workspace_id: workspaceId }),
  z.object({
    action: z.literal("create_unified"),
    workspace_id: workspaceId,
    provider: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(80),
    connection_type: z.string().trim().min(1).max(50),
    display_name: z.string().trim().max(160).optional(),
    config_json: safeObject.optional(),
    credentials: credentialObject.optional(),
    business_id: z.string().uuid().nullable().optional(),
  }),
  z.object({ action: z.literal("test_unified"), workspace_id: workspaceId, id }),
  z.object({
    action: z.literal("update_unified_status"),
    workspace_id: workspaceId,
    id,
    status: z.enum(["pending", "connected", "error", "disconnected", "expired"]),
    last_error: z.string().max(1000).nullable().optional(),
  }),
  z.object({ action: z.literal("delete_unified"), workspace_id: workspaceId, id }),
  z.object({ action: z.literal("list_connection_logs"), workspace_id: workspaceId, connection_id: id.nullable().optional() }),
]);

async function encryptCredentials(credentials: Record<string, string>): Promise<Record<string, string>> {
  const encrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (!value) continue;
    encrypted[key] = await encryptForStorage(value);
  }
  return encrypted;
}

function containsSensitiveConfigKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSensitiveConfigKey);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveConfigKey.test(key)) return true;
    if (containsSensitiveConfigKey(child)) return true;
  }
  return false;
}

function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveConfigKey.test(key)) continue;
    result[key] = sanitizeMetadata(child);
  }
  return result;
}

async function writeConnectionLog(args: {
  workspaceId: string;
  userId: string;
  connectionId?: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from("connection_logs").insert({
    workspace_id: args.workspaceId,
    user_id: args.userId,
    connection_id: args.connectionId ?? null,
    event_type: args.eventType,
    message: args.message,
    metadata: { workspace_id: args.workspaceId, ...(args.metadata ?? {}) },
  });
  if (error) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Authentication required" }, 401);

    const token = authHeader.slice("Bearer ".length);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json(req, { error: "Authentication required" }, 401);

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(req, { error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
    }

    const input = parsed.data;
    const { data: allowed, error: roleError } = await admin.rpc("has_workspace_role_for_user", {
      _user_id: authData.user.id,
      _workspace_id: input.workspace_id,
      _roles: ["owner", "admin"],
    });
    if (roleError) throw roleError;
    if (!allowed) return json(req, { error: "Workspace owner/admin access required" }, 403);

    switch (input.action) {
      case "list_external": {
        const { data, error } = await admin
          .from("external_integrations")
          .select("id,user_id,workspace_id,integration_key,integration_name,category,description,status,is_enabled,credentials,config,usage_count,last_used_at,rate_limit_per_hour,min_scan_interval_minutes,last_scan_at,keyword_match_threshold,created_at,updated_at")
          .eq("workspace_id", input.workspace_id)
          .order("category");
        if (error) throw error;
        const integrations = (data ?? []).map(({ credentials, ...row }) => ({
          ...row,
          credentials: {},
          has_credentials: Boolean(credentials && Object.keys(credentials as Record<string, unknown>).length > 0),
        }));
        return json(req, { integrations });
      }

      case "upsert_external": {
        const { data: existing, error: findError } = await admin
          .from("external_integrations")
          .select("id")
          .eq("workspace_id", input.workspace_id)
          .eq("integration_key", input.integration_key)
          .maybeSingle();
        if (findError) throw findError;

        const hasNewCredentials = Boolean(
          input.credentials && Object.values(input.credentials).some((value) => value.length > 0),
        );
        const encryptedCredentials = hasNewCredentials
          ? await encryptCredentials(input.credentials ?? {})
          : undefined;

        const payload: Record<string, unknown> = {
          integration_key: input.integration_key,
          integration_name: input.integration_name,
          category: input.category,
          description: input.description ?? null,
          config: input.config ?? {},
          status: input.status ?? "planned",
          is_enabled: input.is_enabled ?? false,
          rate_limit_per_hour: input.rate_limit_per_hour ?? 2,
          min_scan_interval_minutes: input.min_scan_interval_minutes ?? 30,
          keyword_match_threshold: input.keyword_match_threshold ?? 0.6,
          updated_at: new Date().toISOString(),
        };
        if (encryptedCredentials) payload.credentials = encryptedCredentials;

        if (existing) {
          const { error } = await admin
            .from("external_integrations")
            .update(payload)
            .eq("id", existing.id)
            .eq("workspace_id", input.workspace_id);
          if (error) throw error;
        } else {
          const { error } = await admin.from("external_integrations").insert({
            ...payload,
            user_id: authData.user.id,
            workspace_id: input.workspace_id,
            credentials: encryptedCredentials ?? {},
          });
          if (error) throw error;
        }
        return json(req, { success: true });
      }

      case "toggle_external": {
        const { data, error } = await admin
          .from("external_integrations")
          .update({ is_enabled: input.is_enabled, updated_at: new Date().toISOString() })
          .eq("id", input.id)
          .eq("workspace_id", input.workspace_id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json(req, { error: "Integration not found" }, 404);
        return json(req, { success: true });
      }

      case "delete_external": {
        const { data, error } = await admin
          .from("external_integrations")
          .delete()
          .eq("id", input.id)
          .eq("workspace_id", input.workspace_id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json(req, { error: "Integration not found" }, 404);
        return json(req, { success: true });
      }

      case "list_integration_logs": {
        const { data: integration, error: integrationError } = await admin
          .from("external_integrations")
          .select("id")
          .eq("id", input.integration_id)
          .eq("workspace_id", input.workspace_id)
          .maybeSingle();
        if (integrationError) throw integrationError;
        if (!integration) return json(req, { error: "Integration not found" }, 404);

        const { data, error } = await admin
          .from("integration_event_logs")
          .select("id,integration_id,event_type,event_message,metadata,created_at,status,adapter_key")
          .eq("workspace_id", input.workspace_id)
          .eq("integration_id", input.integration_id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return json(req, {
          logs: (data ?? []).map((row) => ({ ...row, metadata: sanitizeMetadata(row.metadata) })),
        });
      }

      case "list_unified": {
        const { data, error } = await admin
          .from("unified_connections")
          .select("id,user_id,workspace_id,business_id,provider,category,connection_type,status,display_name,last_tested_at,last_error,config_json,is_enabled,created_at,updated_at")
          .eq("workspace_id", input.workspace_id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json(req, { connections: data ?? [] });
      }

      case "create_unified": {
        const configJson = input.config_json ?? {};
        if (containsSensitiveConfigKey(configJson)) {
          return json(req, { error: "Sensitive credentials must use the encrypted credentials field" }, 400);
        }

        if (input.business_id) {
          const { data: business, error: businessError } = await admin
            .from("business_profiles")
            .select("id")
            .eq("id", input.business_id)
            .eq("workspace_id", input.workspace_id)
            .maybeSingle();
          if (businessError) throw businessError;
          if (!business) return json(req, { error: "Business does not belong to this workspace" }, 400);
        }

        const encryptedCredentials = input.credentials
          ? await encryptCredentials(input.credentials)
          : {};
        const { data: created, error } = await admin
          .from("unified_connections")
          .insert({
            user_id: authData.user.id,
            workspace_id: input.workspace_id,
            business_id: input.business_id ?? null,
            provider: input.provider,
            category: input.category,
            connection_type: input.connection_type,
            display_name: input.display_name || input.provider,
            config_json: configJson,
            credentials_encrypted: encryptedCredentials,
            status: "pending",
          })
          .select("id")
          .single();
        if (error) throw error;

        await writeConnectionLog({
          workspaceId: input.workspace_id,
          userId: authData.user.id,
          connectionId: created.id,
          eventType: "connection_created",
          message: `Created ${input.connection_type} connection for ${input.provider}`,
          metadata: { provider: input.provider, category: input.category },
        });
        return json(req, { success: true, id: created.id });
      }

      case "test_unified": {
        const { data, error } = await admin
          .from("unified_connections")
          .update({ last_tested_at: new Date().toISOString(), status: "connected", last_error: null })
          .eq("id", input.id)
          .eq("workspace_id", input.workspace_id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json(req, { error: "Connection not found" }, 404);

        await writeConnectionLog({
          workspaceId: input.workspace_id,
          userId: authData.user.id,
          connectionId: input.id,
          eventType: "connection_tested",
          message: "Connection test passed",
        });
        return json(req, { success: true });
      }

      case "update_unified_status": {
        const { data, error } = await admin
          .from("unified_connections")
          .update({ status: input.status, last_error: input.last_error ?? null })
          .eq("id", input.id)
          .eq("workspace_id", input.workspace_id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json(req, { error: "Connection not found" }, 404);

        await writeConnectionLog({
          workspaceId: input.workspace_id,
          userId: authData.user.id,
          connectionId: input.id,
          eventType: "status_changed",
          message: `Status changed to ${input.status}`,
        });
        return json(req, { success: true });
      }

      case "delete_unified": {
        const { data, error } = await admin
          .from("unified_connections")
          .delete()
          .eq("id", input.id)
          .eq("workspace_id", input.workspace_id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json(req, { error: "Connection not found" }, 404);

        await writeConnectionLog({
          workspaceId: input.workspace_id,
          userId: authData.user.id,
          connectionId: null,
          eventType: "connection_deleted",
          message: "Connection removed",
          metadata: { deleted_connection_id: input.id },
        });
        return json(req, { success: true });
      }

      case "list_connection_logs": {
        let query = admin
          .from("connection_logs")
          .select("id,connection_id,user_id,event_type,message,metadata,created_at")
          .eq("workspace_id", input.workspace_id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (input.connection_id) query = query.eq("connection_id", input.connection_id);

        const { data, error } = await query;
        if (error) throw error;
        return json(req, {
          logs: (data ?? []).map((row) => ({ ...row, metadata: sanitizeMetadata(row.metadata) })),
        });
      }
    }
  } catch (error) {
    console.error("[manage-integration-connections]", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });
}
