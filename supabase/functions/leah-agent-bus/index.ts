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

function optionalString(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`);
  return value.trim();
}

function integer(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const parsed = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${label}`);
  return parsed;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function optionalFutureIso(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid expires_at");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= Date.now()) throw new Error("expires_at must be in the future");
  return new Date(time).toISOString();
}

function errorStatus(message: string): number {
  if (message === "Worker authentication failed") return 401;
  if (message.includes("idempotency conflict") || message.includes("delivery token") || message.includes("lease invalid") || message.includes("cross-execution")) return 409;
  if (message.includes("required") || message.includes("Invalid") || message.includes("must be") || message.includes("exceeds") || message.includes("unavailable")) return 400;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    await requireLeahWorker(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(body, "workspace_id") ||
      Object.prototype.hasOwnProperty.call(body, "workspaceId") ||
      Object.prototype.hasOwnProperty.call(body, "sender_task_id") ||
      Object.prototype.hasOwnProperty.call(body, "sender_agent_role")
    ) {
      throw new Error("workspace and sender identity are server-derived");
    }

    const action = stringField(body, "action", 80);

    if (action === "send") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const recipientTaskId = optionalUuid(body.recipient_task_id, "recipient_task_id");
      const recipientAgentRole = optionalString(body.recipient_agent_role, 80, "recipient_agent_role");
      if ((recipientTaskId === null) === (recipientAgentRole === null)) throw new Error("Exactly one recipient target is required");
      const topic = stringField(body, "topic", 160);
      const kind = stringField(body, "kind", 20);
      if (!new Set(["command", "event", "request", "response"]).has(kind)) throw new Error("Invalid message kind");
      const payload = objectValue(body.payload, "payload");
      const idempotencyKey = stringField(body, "idempotency_key", 200);
      const replyToId = optionalUuid(body.reply_to_id, "reply_to_id");
      const expiresAt = optionalFutureIso(body.expires_at);
      const maxDeliveryAttempts = integer(body.max_delivery_attempts, 5, 1, 20, "max_delivery_attempts");

      const { data, error } = await admin.rpc("leah_agent_bus_send_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _recipient_task_id: recipientTaskId,
        _recipient_agent_role: recipientAgentRole,
        _topic: topic,
        _kind: kind,
        _payload: payload,
        _idempotency_key: idempotencyKey,
        _reply_to_id: replyToId,
        _expires_at: expiresAt,
        _max_delivery_attempts: maxDeliveryAttempts,
      });
      if (error) throw error;
      return json({ message: data }, (data as Record<string, unknown> | null)?.idempotent_replay ? 200 : 201);
    }

    if (action === "receive") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const limit = integer(body.limit, 10, 1, 50, "limit");
      const deliverySeconds = integer(body.delivery_seconds, 60, 15, 900, "delivery_seconds");
      const { data, error } = await admin.rpc("leah_agent_bus_receive_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _limit: limit,
        _delivery_seconds: deliverySeconds,
      });
      if (error) throw error;
      return json({ messages: data ?? [] });
    }

    if (action === "ack") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const messageId = uuidField(body, "message_id");
      const deliveryToken = uuidField(body, "delivery_token");
      const { data, error } = await admin.rpc("leah_agent_bus_ack_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _message_id: messageId,
        _delivery_token: deliveryToken,
      });
      if (error) throw error;
      return json({ message: data });
    }

    if (action === "fail") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const messageId = uuidField(body, "message_id");
      const deliveryToken = uuidField(body, "delivery_token");
      if (typeof body.retryable !== "boolean") throw new Error("retryable is required");
      const errorCode = stringField(body, "error_code", 120);
      const retryDelayMs = integer(body.retry_delay_ms, 1000, 0, 86_400_000, "retry_delay_ms");
      const { data, error } = await admin.rpc("leah_agent_bus_fail_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _message_id: messageId,
        _delivery_token: deliveryToken,
        _retryable: body.retryable,
        _error_code: errorCode,
        _retry_delay_ms: retryDelayMs,
      });
      if (error) throw error;
      return json({ message: data });
    }

    if (action === "reap") {
      const limit = integer(body.limit, 500, 1, 5000, "limit");
      const { data, error } = await admin.rpc("leah_agent_bus_reap", { _limit: limit });
      if (error) throw error;
      return json({ reap: data });
    }

    throw new Error("Invalid agent-bus action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = errorStatus(message);
    return json({ error: status === 500 ? "Internal LEAH agent-bus error" : message }, status);
  }
});
