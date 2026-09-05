import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";

const admin = createAdminClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Entering `running` is exclusively performed by the atomic DB claim primitive.
// Terminal execution states are completed by the DB after validating task/swarm truth.
const EXECUTION_TERMINAL_TRANSITIONS: Record<string, Set<string>> = {
  queued: new Set(["failed", "cancelled"]),
  running: new Set(["succeeded", "failed", "cancelled"]),
};

// Entering or leaving task `running` is lease-authoritative. Compatibility transitions
// are intentionally limited to non-running administrative state changes.
const TASK_COMPAT_TRANSITIONS: Record<string, Set<string>> = {
  queued: new Set(["cancelled"]),
  retry_wait: new Set(["queued", "cancelled"]),
};

const PROJECT_TRANSITIONS: Record<string, Set<string>> = {
  planning: new Set(["building", "failed"]),
  building: new Set(["ready", "failed"]),
  ready: new Set(["building", "deployed", "failed"]),
  deployed: new Set(["building", "failed"]),
  failed: new Set(["building"]),
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function stringField(body: Record<string, unknown>, key: string, max = 1000): string {
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

function uuidArray(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (value.length > 200) throw new Error(`${label} exceeds 200 items`);
  return value.map((entry) => {
    if (typeof entry !== "string" || !UUID_RE.test(entry)) throw new Error(`${label} contains an invalid UUID`);
    return entry;
  });
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${label}`);
  return parsed;
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
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
  const [expectedHash, suppliedHash] = await Promise.all([sha256Bytes(configured), sha256Bytes(supplied)]);
  if (!constantTimeEqual(expectedHash, suppliedHash)) throw new Error("Worker authentication failed");
}

async function contentHash(value: string): Promise<string> {
  const digest = await sha256Bytes(value);
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function taskById(taskId: string) {
  const { data, error } = await admin.from("leah_tasks")
    .select("id, workspace_id, execution_id, project_id, status, attempt")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Task not found");
  return data;
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

    if (action === "executions.transition") {
      const executionId = uuidField(body, "execution_id");
      const fromStatus = stringField(body, "from_status", 40);
      const toStatus = stringField(body, "to_status", 40);
      if (!EXECUTION_TERMINAL_TRANSITIONS[fromStatus]?.has(toStatus)) {
        throw new Error("Invalid execution transition; running state is claim-derived");
      }
      const errorCode = typeof body.error_code === "string" ? body.error_code.slice(0, 100) : null;
      const errorDetail = body.error_detail && typeof body.error_detail === "object" && !Array.isArray(body.error_detail)
        ? body.error_detail
        : null;
      const { data, error } = await admin.rpc("leah_finish_execution", {
        _execution_id: executionId,
        _from_status: fromStatus,
        _to_status: toStatus,
        _error_code: errorCode,
        _error_detail: errorDetail,
      });
      if (error) throw error;
      return json({ execution: data });
    }

    if (action === "swarms.create") {
      const executionId = uuidField(body, "execution_id");
      const mode = typeof body.mode === "string" ? body.mode : "parallel";
      if (mode !== "parallel") throw new Error("Invalid swarm mode: only parallel is supported in MR3");
      const maxConcurrency = boundedInteger(body.max_concurrency, 1, 1, 128, "swarm concurrency");
      const { data, error } = await admin.rpc("leah_create_swarm", {
        _execution_id: executionId,
        _mode: mode,
        _max_concurrency: maxConcurrency,
      });
      if (error) throw error;
      return json({ swarm: data }, 201);
    }

    if (action === "tasks.add") {
      const executionId = uuidField(body, "execution_id");
      const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
      const priority = boundedInteger(body.priority, 100, -10_000, 10_000, "task priority");
      const agentRole = typeof body.agent_role === "string" && body.agent_role.trim() ? body.agent_role.trim() : "worker";
      if (agentRole.length > 80) throw new Error("Invalid agent role");
      const swarmId = optionalUuid(body.swarm_id, "swarm_id");
      const parentTaskId = optionalUuid(body.parent_task_id, "parent_task_id");
      const dependsOn = uuidArray(body.depends_on, "depends_on");
      const maxAttempts = boundedInteger(body.max_attempts, 3, 1, 20, "max attempts");

      const { data, error } = await admin.rpc("leah_enqueue_task", {
        _execution_id: executionId,
        _priority: priority,
        _input: input,
        _agent_role: agentRole,
        _swarm_id: swarmId,
        _parent_task_id: parentTaskId,
        _depends_on: dependsOn,
        _max_attempts: maxAttempts,
      });
      if (error) throw error;
      return json({ task: data }, 201);
    }

    if (action === "tasks.claim") {
      const workerId = stringField(body, "worker_id", 160);
      const leaseSeconds = boundedInteger(body.lease_seconds, 60, 15, 900, "lease duration");
      const { data, error } = await admin.rpc("leah_claim_next_task", {
        _worker_id: workerId,
        _lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return json({ task: data ?? null });
    }

    if (action === "tasks.heartbeat") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const extendSeconds = boundedInteger(body.extend_seconds, 60, 15, 900, "lease duration");
      const { data, error } = await admin.rpc("leah_heartbeat_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _extend_seconds: extendSeconds,
      });
      if (error) throw error;
      if (!data) throw new Error("Task lease invalid or expired");
      return json({ success: true });
    }

    if (action === "tasks.finish") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const status = stringField(body, "status", 40);
      if (!new Set(["succeeded", "failed", "retry_wait", "cancelled"]).has(status)) throw new Error("Invalid task finish status");
      const retryDelayMs = boundedInteger(body.retry_delay_ms, 1000, 0, 86_400_000, "retry delay");
      const output = body.output === undefined ? null : body.output;
      const errorBody = body.error === undefined ? null : body.error;
      const { data, error } = await admin.rpc("leah_finish_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _status: status,
        _output: output,
        _error: errorBody,
        _retry_delay_ms: retryDelayMs,
      });
      if (error) throw error;
      return json({ task: data });
    }

    if (action === "tasks.transition") {
      const taskId = uuidField(body, "task_id");
      const fromStatus = stringField(body, "from_status", 40);
      const toStatus = stringField(body, "to_status", 40);
      if (!TASK_COMPAT_TRANSITIONS[fromStatus]?.has(toStatus)) {
        throw new Error("Invalid task transition; running tasks require claim/finish lease flow");
      }
      const task = await taskById(taskId);
      if (task.status !== fromStatus) throw new Error("Task state conflict");

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status: toStatus, updated_at: now };
      if (toStatus === "cancelled") patch.ended_at = now;
      if (toStatus === "queued") {
        patch.available_at = now;
        patch.started_at = null;
        patch.ended_at = null;
      }

      const { data, error } = await admin.from("leah_tasks").update(patch)
        .eq("id", task.id)
        .eq("workspace_id", task.workspace_id)
        .eq("status", fromStatus)
        .select("id, execution_id, project_id, seq, priority, status, attempt, available_at, started_at, ended_at, output, error")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Task state conflict");
      return json({ task: data });
    }

    if (action === "queue.reap") {
      const limit = boundedInteger(body.limit, 100, 1, 1000, "reap limit");
      const { data: expired, error: expiredError } = await admin.rpc("leah_reap_expired_task_leases", { _limit: limit });
      if (expiredError) throw expiredError;
      const { data: blocked, error: blockedError } = await admin.rpc("leah_fail_blocked_tasks", { _limit: limit });
      if (blockedError) throw blockedError;
      return json({ expired_reaped: expired ?? 0, dependency_failed: blocked ?? 0 });
    }

    if (action === "scheduler.tick") {
      const limit = boundedInteger(body.limit, 20, 1, 200, "scheduler limit");
      const { data, error } = await admin.rpc("leah_scheduler_tick", { _limit: limit });
      if (error) throw error;
      return json({ scheduler: data });
    }

    if (action === "artifacts.put") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const kind = stringField(body, "kind", 80);
      const path = stringField(body, "path", 500);
      const content = typeof body.content === "string" ? body.content : "";
      if (content.length > 1_000_000) throw new Error("Artifact content exceeds 1 MB; use object storage");
      const hash = await contentHash(content);
      const { data, error } = await admin.rpc("leah_put_artifact_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _kind: kind,
        _path: path,
        _content: content,
        _content_hash: hash,
      });
      if (error) throw error;
      return json({ artifact: data }, 201);
    }

    if (action === "projects.transition") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const fromStatus = stringField(body, "from_status", 40);
      const toStatus = stringField(body, "to_status", 40);
      if (!PROJECT_TRANSITIONS[fromStatus]?.has(toStatus)) throw new Error("Invalid project transition");
      const { data, error } = await admin.rpc("leah_transition_project_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _from_status: fromStatus,
        _to_status: toStatus,
      });
      if (error) throw error;
      return json({ project: data });
    }

    if (action === "semantic.mark") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const semanticId = uuidField(body, "semantic_id");
      const status = stringField(body, "status", 20);
      if (!new Set(["embedded", "failed"]).has(status)) throw new Error("Invalid semantic status");
      const provider = status === "embedded" ? stringField(body, "provider", 100) : null;
      const providerRef = status === "embedded" ? stringField(body, "provider_ref", 500) : null;
      const embeddingRef = status === "embedded" ? stringField(body, "embedding_ref", 1000) : null;
      const semanticError = status === "failed" && body.error && typeof body.error === "object" && !Array.isArray(body.error)
        ? body.error
        : null;
      const { data, error } = await admin.rpc("leah_mark_semantic_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _semantic_id: semanticId,
        _status: status,
        _provider: provider,
        _provider_ref: providerRef,
        _embedding_ref: embeddingRef,
        _error: semanticError,
      });
      if (error) throw error;
      return json({ memory: data });
    }

    if (action === "secrets.read_for_execution") {
      throw new Error("Unsupported worker action: use secrets.read_for_task with an active lease");
    }

    if (action === "secrets.read_for_task") {
      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const secretId = uuidField(body, "secret_id");
      const { data, error } = await admin.rpc("leah_vault_read_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _secret_id: secretId,
      });
      if (error) throw error;
      if (typeof data !== "string" || !data) throw new Error("Secret unavailable");
      return json({ secret: data });
    }

    throw new Error("Unknown LEAH worker action");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Worker authentication failed" ? 401 :
      message.toLowerCase().includes("not found") ? 404 :
      message.toLowerCase().includes("conflict") || message.toLowerCase().includes("terminal") || message.includes("lease invalid") || message.includes("unfinished") ? 409 :
      message.includes("required") || message.includes("Invalid") || message.includes("must") || message.includes("exceeds") || message.includes("not producing") || message.includes("not running") || message.includes("Unsupported") ? 400 : 500;
    return json({ error: status === 500 ? "Internal LEAH worker error" : message }, status);
  }
});