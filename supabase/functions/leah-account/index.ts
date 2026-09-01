import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";
import { rejectWorkspaceInjection, resolveLeahSession } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { generateProvider, listProviderModels, parseProviderId, ProviderKnownError, ProviderUnknownOutcomeError } from "../_shared/leah-provider-client.ts";

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

function requiredString(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${key} is required`);
  return value.trim();
}

async function activeBinding(workspaceId: string, provider: string) {
  const { data, error } = await admin.from("leah_workspace_provider_bindings")
    .select("id,provider,secret_id,model,status,validation_status,validation_error_code,last_validated_at")
    .eq("workspace_id", workspaceId).eq("provider", provider).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("LEAH provider binding not found");
  return data;
}

async function providerCredential(workspaceId: string, userId: string, provider: string) {
  const binding = await activeBinding(workspaceId, provider);
  const { data, error } = await admin.rpc("leah_vault_read_for_runtime", {
    _workspace_id: workspaceId,
    _user_id: userId,
    _secret_id: binding.secret_id,
    _execution_id: null,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("Secret unavailable");
  return { binding, apiKey: data };
}

async function recordValidation(input: {
  workspaceId: string; userId: string; provider: string; model: string;
  status: "valid" | "invalid" | "unknown"; providerRequestId?: string | null;
  usageSource?: "provider" | "unavailable"; inputTokens?: number | null;
  outputTokens?: number | null; totalTokens?: number | null; latencyMs?: number | null;
  errorCode?: string | null;
}) {
  const { error } = await admin.rpc("leah_record_provider_validation", {
    _workspace_id: input.workspaceId,
    _user_id: input.userId,
    _provider: input.provider,
    _model: input.model,
    _status: input.status,
    _provider_request_id: input.providerRequestId ?? null,
    _usage_source: input.usageSource ?? "unavailable",
    _input_tokens: input.inputTokens ?? null,
    _output_tokens: input.outputTokens ?? null,
    _total_tokens: input.totalTokens ?? null,
    _latency_ms: input.latencyMs ?? null,
    _error_code: input.errorCode ?? null,
  });
  if (error) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const session = await resolveLeahSession(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    rejectWorkspaceInjection(body);
    for (const forbidden of ["base_url", "baseUrl", "secret_id", "secretId"]) {
      if (Object.prototype.hasOwnProperty.call(body, forbidden)) throw new Error(`${forbidden} is server-derived`);
    }
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

    if (action === "provider.list") {
      await requireWorkspaceAdmin(session.userId, session.workspaceId);
      const { data: bindings, error } = await admin.from("leah_workspace_provider_bindings")
        .select("provider,secret_id,model,status,validation_status,validation_error_code,last_validated_at,created_at,updated_at")
        .eq("workspace_id", session.workspaceId).order("provider");
      if (error) throw error;
      const ids = (bindings ?? []).map((b) => b.secret_id).filter(Boolean);
      const hints = new Map<string, { hint: string; version: number; status: string }>();
      if (ids.length) {
        const { data: secrets, error: secretError } = await admin.from("leah_secret_registry")
          .select("id,hint,version,status").eq("workspace_id", session.workspaceId).in("id", ids);
        if (secretError) throw secretError;
        for (const s of secrets ?? []) hints.set(s.id, { hint: s.hint, version: s.version, status: s.status });
      }
      return json(req, { providers: (bindings ?? []).map((b) => ({
        provider: b.provider, model: b.model, status: b.status,
        validation_status: b.validation_status, validation_error_code: b.validation_error_code,
        last_validated_at: b.last_validated_at, created_at: b.created_at, updated_at: b.updated_at,
        credential_hint: hints.get(b.secret_id)?.hint ?? null,
        credential_version: hints.get(b.secret_id)?.version ?? null,
        credential_status: hints.get(b.secret_id)?.status ?? null,
      })) });
    }

    if (action === "provider.save") {
      await requireWorkspaceAdmin(session.userId, session.workspaceId);
      const provider = parseProviderId(requiredString(body, "provider", 40));
      const model = requiredString(body, "model", 200);
      const apiKey = requiredString(body, "api_key", 20000);
      if (apiKey.length < 8) throw new Error("Invalid provider credential");
      const { data, error } = await admin.rpc("leah_save_workspace_provider", {
        _workspace_id: session.workspaceId,
        _user_id: session.userId,
        _provider: provider,
        _model: model,
        _secret_value: apiKey,
      });
      if (error) throw error;
      return json(req, { provider: data }, 201);
    }

    if (action === "provider.remove") {
      await requireWorkspaceAdmin(session.userId, session.workspaceId);
      const provider = parseProviderId(requiredString(body, "provider", 40));
      const { data, error } = await admin.rpc("leah_remove_workspace_provider", {
        _workspace_id: session.workspaceId, _user_id: session.userId, _provider: provider,
      });
      if (error) throw error;
      return json(req, { removed: Boolean(data) });
    }

    if (action === "provider.models") {
      await requireWorkspaceAdmin(session.userId, session.workspaceId);
      const provider = parseProviderId(requiredString(body, "provider", 40));
      const { apiKey } = await providerCredential(session.workspaceId, session.userId, provider);
      const discovered = await listProviderModels(provider, apiKey);
      return json(req, { provider, models: discovered.models, source: discovered.source });
    }

    if (action === "provider.test") {
      await requireWorkspaceAdmin(session.userId, session.workspaceId);
      const provider = parseProviderId(requiredString(body, "provider", 40));
      const { binding, apiKey } = await providerCredential(session.workspaceId, session.userId, provider);
      const startedAt = Date.now();
      try {
        const result = await generateProvider({
          provider, apiKey, model: binding.model,
          system: "Connection test. Reply with exactly LEAH_OK and nothing else.", user: "ping", timeoutMs: 20000,
        });
        const latencyMs = Date.now() - startedAt;
        const exact = result.valid && result.text.trim() === "LEAH_OK";
        await recordValidation({
          workspaceId: session.workspaceId, userId: session.userId, provider, model: binding.model,
          status: exact ? "valid" : "invalid", providerRequestId: result.providerRequestId,
          usageSource: result.usage.usageSource, inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens, totalTokens: result.usage.totalTokens,
          latencyMs, errorCode: exact ? null : "invalid_test_response",
        });
        const { error: stateError } = await admin.rpc("leah_set_workspace_provider_validation", {
          _workspace_id: session.workspaceId, _provider: provider,
          _status: exact ? "valid" : "invalid", _error_code: exact ? null : "invalid_test_response",
        });
        if (stateError) throw stateError;
        if (!exact) return json(req, { ok: false, provider, model: binding.model, error: "invalid_test_response" }, 502);
        return json(req, { ok: true, provider, model: binding.model, provider_request_id: result.providerRequestId, latency_ms: latencyMs, usage: result.usage });
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        if (error instanceof ProviderUnknownOutcomeError) {
          await recordValidation({ workspaceId: session.workspaceId, userId: session.userId, provider, model: binding.model, status: "unknown", latencyMs, errorCode: "outcome_unknown" });
          return json(req, { ok: false, provider, model: binding.model, error: "outcome_unknown" }, 409);
        }
        const errorCode = error instanceof ProviderKnownError ? error.code : "connection_test_failed";
        await recordValidation({ workspaceId: session.workspaceId, userId: session.userId, provider, model: binding.model, status: "invalid", latencyMs, errorCode });
        const { error: stateError } = await admin.rpc("leah_set_workspace_provider_validation", {
          _workspace_id: session.workspaceId, _provider: provider, _status: "invalid", _error_code: errorCode,
        });
        if (stateError) throw stateError;
        return json(req, { ok: false, provider, model: binding.model, error: errorCode }, 502);
      }
    }

    throw new Error("Unknown LEAH account action");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "LEAH session required" || message === "LEAH session invalid or expired" ? 401 :
      message.startsWith("Forbidden") || message.includes("access revoked") || message.includes("entitlement inactive") || message.includes("entitlement expired") ? 403 :
      message.toLowerCase().includes("not found") || message.includes("unavailable") ? 404 :
      message.includes("workspace_id") || message.includes("server-derived") || message.includes("required") || message.startsWith("Invalid") || message.startsWith("Unknown") ? 400 : 500;
    return json(req, { error: status === 500 ? "Internal LEAH account error" : message }, status);
  }
});