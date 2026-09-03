import { createAdminClient } from "../_shared/admin-client.ts";
import { requireLeahWorker } from "../_shared/leah-worker-auth.ts";

const admin = createAdminClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function stringField(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${key} is required`);
  return value.trim();
}
function optionalString(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`);
  return value.trim();
}
function uuidField(body: Record<string, unknown>, key: string): string {
  const value = stringField(body, key, 64);
  if (!UUID_RE.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
}
function optionalUuid(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${label} must be a UUID`);
  return value;
}
function uuidArray(value: unknown, label: string, min = 1, max = 200): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label} must contain ${min}-${max} UUIDs`);
  return value.map((entry) => {
    if (typeof entry !== "string" || !UUID_RE.test(entry)) throw new Error(`${label} contains an invalid UUID`);
    return entry;
  });
}
function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function nonNegativeBigInt(value: unknown, label: string): number {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid ${label}`);
  return n;
}
function httpsUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 1000) throw new Error("Invalid public_url");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Invalid public_url"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Invalid public_url");
  return parsed.toString();
}
function errorStatus(message: string): number {
  if (message === "Worker authentication failed") return 401;
  if (message.includes("conflict") || message.includes("mismatch") || message.includes("not queued") || message.includes("approval")) return 409;
  if (message.includes("not found") || message.includes("unavailable")) return 404;
  if (message.includes("required") || message.includes("Invalid") || message.includes("must") || message.includes("exceeds")) return 400;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    await requireLeahWorker(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    for (const forbidden of ["workspace_id", "workspaceId", "provider", "provider_url", "base_url", "api_key", "secret_value"]) {
      if (Object.prototype.hasOwnProperty.call(body, forbidden)) throw new Error(`${forbidden} is server-derived and must not be supplied`);
    }
    const action = stringField(body, "action", 80);

    if (action === "build.begin") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const buildKey = stringField(body, "build_key", 200);
      const artifactIds = uuidArray(body.artifact_ids, "artifact_ids");
      const builder = stringField(body, "builder", 100);
      const builderVersion = optionalString(body.builder_version, 100, "builder_version");
      const { data, error } = await admin.rpc("leah_begin_build_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _build_key: buildKey,
        _artifact_ids: artifactIds,
        _builder: builder,
        _builder_version: builderVersion,
      });
      if (error) throw error;
      return json({ build: data }, (data as Record<string, unknown> | null)?.idempotent_replay ? 200 : 201);
    }

    if (action === "build.finish") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const buildId = uuidField(body, "build_id");
      const outcome = stringField(body, "outcome", 20);
      if (!new Set(["succeeded", "failed", "unknown"]).has(outcome)) throw new Error("Invalid build outcome");
      const outputDigest = optionalString(body.output_digest, 64, "output_digest");
      const outputMetadata = objectValue(body.output_metadata, "output_metadata");
      const errorCode = optionalString(body.error_code, 120, "error_code");
      const { data, error } = await admin.rpc("leah_finish_build_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _build_id: buildId,
        _outcome: outcome,
        _output_digest: outputDigest,
        _output_metadata: outputMetadata,
        _error_code: errorCode,
      });
      if (error) throw error;
      return json({ build: data });
    }

    if (action === "deployment.request") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const buildId = uuidField(body, "build_id");
      const targetId = uuidField(body, "target_id");
      const requestKey = stringField(body, "request_key", 200);
      const { data, error } = await admin.rpc("leah_request_deployment_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _build_id: buildId,
        _target_id: targetId,
        _request_key: requestKey,
      });
      if (error) throw error;
      return json({ deployment: data }, (data as Record<string, unknown> | null)?.idempotent_replay ? 200 : 201);
    }

    if (action === "deployment.begin") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const deploymentId = uuidField(body, "deployment_id");
      const { data, error } = await admin.rpc("leah_begin_deployment_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _deployment_id: deploymentId,
      });
      if (error) throw error;
      return json({ operation: data });
    }

    if (action === "deployment.settle") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const deploymentId = uuidField(body, "deployment_id");
      const operationNonce = uuidField(body, "operation_nonce");
      const outcome = stringField(body, "outcome", 20);
      if (!new Set(["succeeded", "failed", "unknown"]).has(outcome)) throw new Error("Invalid deployment outcome");
      const providerRef = optionalString(body.provider_ref, 500, "provider_ref");
      const publicUrl = httpsUrl(body.public_url);
      const costMicros = nonNegativeBigInt(body.cost_micros, "cost_micros");
      const errorCode = optionalString(body.error_code, 120, "error_code");
      const { data, error } = await admin.rpc("leah_settle_deployment_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _deployment_id: deploymentId,
        _operation_nonce: operationNonce,
        _outcome: outcome,
        _provider_ref: providerRef,
        _public_url: publicUrl,
        _cost_micros: costMicros,
        _error_code: errorCode,
      });
      if (error) throw error;
      return json({ deployment: data });
    }

    if (action === "deployment.reconcile") {
      const deploymentId = uuidField(body, "deployment_id");
      const operationNonce = uuidField(body, "operation_nonce");
      const outcome = stringField(body, "outcome", 20);
      if (!new Set(["succeeded", "failed"]).has(outcome)) throw new Error("Invalid reconciliation outcome");
      const providerRef = optionalString(body.provider_ref, 500, "provider_ref");
      const publicUrl = httpsUrl(body.public_url);
      const costMicros = nonNegativeBigInt(body.cost_micros, "cost_micros");
      const errorCode = optionalString(body.error_code, 120, "error_code");
      const { data, error } = await admin.rpc("leah_reconcile_unknown_deployment", {
        _deployment_id: deploymentId,
        _operation_nonce: operationNonce,
        _outcome: outcome,
        _provider_ref: providerRef,
        _public_url: publicUrl,
        _cost_micros: costMicros,
        _error_code: errorCode,
      });
      if (error) throw error;
      return json({ deployment: data });
    }

    throw new Error("Invalid build/deploy action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = errorStatus(message);
    return json({ error: status === 500 ? "Internal LEAH build/deploy error" : message }, status);
  }
});
