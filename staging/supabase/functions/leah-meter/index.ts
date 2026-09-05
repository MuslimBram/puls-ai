import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";

const admin = createAdminClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function requireWorker(req: Request): Promise<void> {
  const configured = Deno.env.get("LEAH_WORKER_SECRET")?.trim() ?? "";
  const supplied = req.headers.get("X-Leah-Worker-Secret")?.trim() ?? "";
  if (configured.length < 32 || supplied.length < 32) throw new Error("Worker authentication failed");
  const [a, b] = await Promise.all([sha256(configured), sha256(supplied)]);
  if (!constantTimeEqual(a, b)) throw new Error("Worker authentication failed");
}

function stringField(body: Record<string, unknown>, key: string, max = 1000): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalStringField(body: Record<string, unknown>, key: string, max = 1000): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`Invalid ${key}`);
  return value.trim();
}

function uuidField(body: Record<string, unknown>, key: string): string {
  const value = stringField(body, key, 64);
  if (!UUID_RE.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
}

function optionalUuidField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
}

function integerField(body: Record<string, unknown>, key: string, min: number, max: number, fallback?: number): number {
  const raw = body[key];
  const value = raw === undefined && fallback !== undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}

function nullableIntegerField(body: Record<string, unknown>, key: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  const raw = body[key];
  if (raw === undefined || raw === null) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}

function booleanField(body: Record<string, unknown>, key: string, fallback = false): boolean {
  const raw = body[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== "boolean") throw new Error(`Invalid ${key}`);
  return raw;
}

function metadata(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid metadata");
  return value as Record<string, unknown>;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    await requireWorker(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, "workspace_id") || Object.prototype.hasOwnProperty.call(body, "workspaceId")) {
      throw new Error("workspace_id is derived from authoritative parent records");
    }
    const action = stringField(body, "action", 80);

    if (action === "provider.begin") {
      const billingMode = stringField(body, "billing_mode", 20);
      if (!new Set(["byok", "managed"]).has(billingMode)) throw new Error("Invalid provider billing_mode");
      const { data, error } = await admin.rpc("leah_begin_provider_attempt", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _logical_request_id: uuidField(body, "logical_request_id"),
        _attempt_id: uuidField(body, "attempt_id"),
        _billing_mode: billingMode,
        _provider: stringField(body, "provider", 100),
        _model: stringField(body, "model", 200),
        _reservation_id: optionalUuidField(body, "reservation_id"),
        _metadata: metadata(body.metadata),
      });
      if (error) throw error;
      return json({ attempt: data }, 201);
    }

    if (action === "provider.finish") {
      const outcome = stringField(body, "outcome", 20);
      const usageSource = stringField(body, "usage_source", 20);
      if (!new Set(["succeeded", "failed", "unknown"]).has(outcome)) throw new Error("Invalid provider outcome");
      if (!new Set(["provider", "estimated", "unavailable"]).has(usageSource)) throw new Error("Invalid usage_source");
      const { data, error } = await admin.rpc("leah_finish_provider_attempt", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _attempt_id: uuidField(body, "attempt_id"),
        _outcome: outcome,
        _provider_request_id: optionalStringField(body, "provider_request_id", 500),
        _usage_source: usageSource,
        _input_tokens: nullableIntegerField(body, "input_tokens", 0, 10_000_000),
        _output_tokens: nullableIntegerField(body, "output_tokens", 0, 10_000_000),
        _total_tokens: nullableIntegerField(body, "total_tokens", 0, 20_000_000),
        _cost_micros: nullableIntegerField(body, "cost_micros"),
        _error_code: optionalStringField(body, "error_code", 120),
        _latency_ms: nullableIntegerField(body, "latency_ms", 0, 86_400_000),
        _canonical_result: booleanField(body, "canonical_result", false),
        _metadata: metadata(body.metadata),
      });
      if (error) throw error;
      return json({ attempt: data });
    }

    if (action === "provider.materialization.claim") {
      const { data, error } = await admin.rpc("leah_claim_provider_materialization", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _attempt_id: uuidField(body, "attempt_id"),
        _materialization_key: stringField(body, "materialization_key", 200),
      });
      if (error) throw error;
      return json({ materialization: data });
    }

    if (action === "provider.materialization.finalize") {
      const { data, error } = await admin.rpc("leah_finalize_provider_materialization", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _attempt_id: uuidField(body, "attempt_id"),
        _materialization_key: stringField(body, "materialization_key", 200),
        _materialized_ref: stringField(body, "materialized_ref", 1000),
      });
      if (error) throw error;
      return json({ materialization: data });
    }

    if (action === "managed.reserve") {
      const { data, error } = await admin.rpc("leah_reserve_managed_tokens", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _event_key: stringField(body, "event_key", 200),
        _requested_tokens: integerField(body, "requested_tokens", 1, 10_000_000),
        _ttl_seconds: integerField(body, "ttl_seconds", 30, 900, 300),
      });
      if (error) throw error;
      return json({ reservation: data }, 201);
    }

    if (action === "managed.finalize") {
      const { data, error } = await admin.rpc("leah_finalize_managed_usage", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _reservation_id: uuidField(body, "reservation_id"),
        _provider: stringField(body, "provider", 100),
        _model: stringField(body, "model", 200),
        _input_tokens: integerField(body, "input_tokens", 0, 10_000_000),
        _output_tokens: integerField(body, "output_tokens", 0, 10_000_000),
        _cost_micros: integerField(body, "cost_micros", 0, Number.MAX_SAFE_INTEGER),
        _metadata: metadata(body.metadata),
      });
      if (error) throw error;
      return json({ usage: data });
    }

    if (action === "managed.release") {
      const { data, error } = await admin.rpc("leah_release_managed_token_reservation", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _reservation_id: uuidField(body, "reservation_id"),
      });
      if (error) throw error;
      return json({ released: Boolean(data) });
    }

    if (action === "byok.record") {
      const { data, error } = await admin.rpc("leah_record_byok_usage_for_task", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _event_key: stringField(body, "event_key", 200),
        _provider: stringField(body, "provider", 100),
        _model: stringField(body, "model", 200),
        _input_tokens: integerField(body, "input_tokens", 0, 10_000_000),
        _output_tokens: integerField(body, "output_tokens", 0, 10_000_000),
        _cost_micros: integerField(body, "cost_micros", 0, Number.MAX_SAFE_INTEGER, 0),
        _metadata: metadata(body.metadata),
      });
      if (error) throw error;
      return json({ usage: data });
    }

    if (action === "operational.record") {
      const usageType = stringField(body, "usage_type", 40);
      if (!new Set(["generation", "agent_seconds"]).has(usageType)) throw new Error("Invalid operational usage_type");
      const { data, error } = await admin.rpc("leah_record_operational_usage_for_task", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _event_key: stringField(body, "event_key", 200),
        _usage_type: usageType,
        _quantity: integerField(body, "quantity", 0, Number.MAX_SAFE_INTEGER, 1),
        _metadata: metadata(body.metadata),
      });
      if (error) throw error;
      return json({ usage: data });
    }

    if (action === "deploy.reserve") {
      const { data, error } = await admin.rpc("leah_reserve_deployment_for_task", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _event_key: stringField(body, "event_key", 200),
        _target: stringField(body, "target", 100),
        _ttl_seconds: integerField(body, "ttl_seconds", 60, 1800, 600),
      });
      if (error) throw error;
      return json({ reservation: data }, 201);
    }

    if (action === "deploy.finalize") {
      const { data, error } = await admin.rpc("leah_finalize_deployment_usage", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _reservation_id: uuidField(body, "reservation_id"),
        _provider_ref: stringField(body, "provider_ref", 500),
        _cost_micros: integerField(body, "cost_micros", 0, Number.MAX_SAFE_INTEGER, 0),
        _metadata: metadata(body.metadata),
      });
      if (error) throw error;
      return json({ usage: data });
    }

    if (action === "deploy.release") {
      const { data, error } = await admin.rpc("leah_release_deployment_reservation", {
        _task_id: uuidField(body, "task_id"),
        _lease_token: uuidField(body, "lease_token"),
        _reservation_id: uuidField(body, "reservation_id"),
      });
      if (error) throw error;
      return json({ released: Boolean(data) });
    }

    if (action === "reservations.reap") {
      const { data, error } = await admin.rpc("leah_reap_usage_reservations", {
        _limit: integerField(body, "limit", 1, 5000, 500),
      });
      if (error) throw error;
      return json({ reaped: data });
    }

    throw new Error("Unknown LEAH meter action");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Worker authentication failed" ? 401 :
      message.includes("QUOTA_EXCEEDED") || message.includes("_DISABLED") || message.includes("entitlement inactive") ? 403 :
      message.toLowerCase().includes("conflict") || message.includes("ALREADY_CLAIMED") ? 409 :
      message.includes("required") || message.includes("Invalid") || message.includes("must be") || message.includes("workspace_id") || message.includes("not active") || message.includes("not canonical") ? 400 : 500;
    return json({ error: status === 500 ? "Internal LEAH meter error" : message }, status);
  }
});
