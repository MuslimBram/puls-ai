import { createAdminClient } from "../_shared/admin-client.ts";
import { resolveLeahSession } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import {
  embedLeahText,
  LeahEmbeddingKnownError,
  LeahEmbeddingUnknownOutcomeError,
  LEAH_EMBEDDING_DIMENSIONS,
  LEAH_EMBEDDING_MODEL,
  LEAH_EMBEDDING_PROVIDER,
  vectorLiteral,
} from "../_shared/leah-embedding-client.ts";

const admin = createAdminClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMORY_KINDS = new Set(["semantic", "episodic", "dream", "preference", "artifact", "task", "fact"]);

function cors(req: Request) {
  return buildCorsHeaders(req, { allowAnyOrigin: false });
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function text(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${key} is required`);
  return value.trim();
}
function uuid(body: Record<string, unknown>, key: string): string {
  const value = text(body, key, 64);
  if (!UUID_RE.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
}
function uuidArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error(`${label} must contain 1-50 UUIDs`);
  return value.map((entry) => {
    if (typeof entry !== "string" || !UUID_RE.test(entry)) throw new Error(`${label} contains an invalid UUID`);
    return entry;
  });
}
function boundedNumber(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${label}`);
  return parsed;
}
function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const parsed = boundedNumber(value, fallback, min, max, label);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}
function futureIso(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid expires_at");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= Date.now()) throw new Error("expires_at must be in the future");
  return new Date(time).toISOString();
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
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
  const [expected, actual] = await Promise.all([sha256Bytes(configured), sha256Bytes(supplied)]);
  if (!constantTimeEqual(expected, actual)) throw new Error("Worker authentication failed");
}

async function requireProject(workspaceId: string, projectId: string) {
  const { data, error } = await admin.from("leah_projects")
    .select("id,workspace_id,status,archived_at")
    .eq("id", projectId).eq("workspace_id", workspaceId).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Project not found");
  return data;
}
async function requireTaskLeaseBeforeProvider(taskId: string, leaseToken: string) {
  const { data: task, error } = await admin.from("leah_tasks")
    .select("id,workspace_id,project_id,execution_id,status,lease_token,lease_expires_at")
    .eq("id", taskId).maybeSingle();
  if (error) throw error;
  if (!task || task.status !== "running" || task.lease_token !== leaseToken || !task.lease_expires_at || Date.parse(task.lease_expires_at) <= Date.now()) {
    throw new Error("Task lease invalid or expired");
  }
  const { data: execution, error: executionError } = await admin.from("leah_executions")
    .select("id,status").eq("id", task.execution_id).eq("workspace_id", task.workspace_id).maybeSingle();
  if (executionError) throw executionError;
  if (!execution || execution.status !== "running") throw new Error("Execution is not running");
  return task;
}

function safeProviderStatus(error: unknown): number {
  if (error instanceof LeahEmbeddingKnownError) {
    if (error.status === 400) return 400;
    if (error.status === 429) return 503;
    return 502;
  }
  if (error instanceof LeahEmbeddingUnknownOutcomeError) return 409;
  return 500;
}
function safeProviderCode(error: unknown): string {
  if (error instanceof LeahEmbeddingKnownError) return error.code;
  if (error instanceof LeahEmbeddingUnknownOutcomeError) return "embedding_outcome_unknown";
  return "embedding_failure";
}

async function embedForActor(workspaceId: string, actorId: string, semanticId: string) {
  const { data: begun, error: beginError } = await admin.rpc("leah_begin_semantic_embedding_for_actor", {
    _workspace_id: workspaceId,
    _actor_id: actorId,
    _semantic_id: semanticId,
    _provider: LEAH_EMBEDDING_PROVIDER,
    _model: LEAH_EMBEDDING_MODEL,
    _dimensions: LEAH_EMBEDDING_DIMENSIONS,
  });
  if (beginError) throw beginError;
  const begin = begun as Record<string, unknown>;
  const attemptId = String(begin.attempt_id ?? "");
  const chunk = String(begin.chunk ?? "");
  const started = Date.now();
  try {
    const result = await embedLeahText(chunk);
    const { data, error } = await admin.rpc("leah_finalize_semantic_embedding_for_actor", {
      _workspace_id: workspaceId,
      _actor_id: actorId,
      _attempt_id: attemptId,
      _embedding_text: vectorLiteral(result.embedding),
      _provider_request_id: result.providerRequestId,
      _latency_ms: Date.now() - started,
    });
    if (error) throw new Error("LEAH_MEMORY_EVIDENCE_SETTLEMENT_FAILED");
    return data;
  } catch (error) {
    if ((error as Error)?.message === "LEAH_MEMORY_EVIDENCE_SETTLEMENT_FAILED") throw error;
    const outcome = error instanceof LeahEmbeddingUnknownOutcomeError ? "unknown" : "failed";
    const { error: settleError } = await admin.rpc("leah_fail_semantic_embedding_for_actor", {
      _workspace_id: workspaceId,
      _actor_id: actorId,
      _attempt_id: attemptId,
      _outcome: outcome,
      _error_code: safeProviderCode(error),
      _latency_ms: Date.now() - started,
    });
    if (settleError) throw new Error("LEAH_MEMORY_EVIDENCE_SETTLEMENT_FAILED");
    throw error;
  }
}

async function embedForTask(taskId: string, leaseToken: string, semanticId: string) {
  const { data: begun, error: beginError } = await admin.rpc("leah_begin_semantic_embedding_for_task", {
    _task_id: taskId,
    _lease_token: leaseToken,
    _semantic_id: semanticId,
    _provider: LEAH_EMBEDDING_PROVIDER,
    _model: LEAH_EMBEDDING_MODEL,
    _dimensions: LEAH_EMBEDDING_DIMENSIONS,
  });
  if (beginError) throw beginError;
  const begin = begun as Record<string, unknown>;
  const attemptId = String(begin.attempt_id ?? "");
  const chunk = String(begin.chunk ?? "");
  const started = Date.now();
  try {
    const result = await embedLeahText(chunk);
    const { data, error } = await admin.rpc("leah_finalize_semantic_embedding_for_task", {
      _task_id: taskId,
      _lease_token: leaseToken,
      _attempt_id: attemptId,
      _embedding_text: vectorLiteral(result.embedding),
      _provider_request_id: result.providerRequestId,
      _latency_ms: Date.now() - started,
    });
    if (error) throw new Error("LEAH_MEMORY_EVIDENCE_SETTLEMENT_FAILED");
    return data;
  } catch (error) {
    if ((error as Error)?.message === "LEAH_MEMORY_EVIDENCE_SETTLEMENT_FAILED") throw error;
    const outcome = error instanceof LeahEmbeddingUnknownOutcomeError ? "unknown" : "failed";
    const { error: settleError } = await admin.rpc("leah_fail_semantic_embedding_for_task", {
      _task_id: taskId,
      _lease_token: leaseToken,
      _attempt_id: attemptId,
      _outcome: outcome,
      _error_code: safeProviderCode(error),
      _latency_ms: Date.now() - started,
    });
    if (settleError) throw new Error("LEAH_MEMORY_EVIDENCE_SETTLEMENT_FAILED");
    throw error;
  }
}

function publicErrorStatus(message: string): number {
  if (message === "Worker authentication failed" || message === "LEAH session required" || message === "LEAH session invalid or expired") return 401;
  if (message.startsWith("Forbidden") || message.includes("entitlement inactive") || message.includes("access revoked")) return 403;
  if (message.includes("not found")) return 404;
  if (message.includes("conflict") || message.includes("state")) return 409;
  if (message.includes("required") || message.includes("Invalid") || message.includes("must be") || message.includes("must contain")) return 400;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, "workspace_id") || Object.prototype.hasOwnProperty.call(body, "workspaceId")) {
      throw new Error("workspace_id is server-derived and must not be supplied");
    }
    const action = text(body, "action", 80);
    const workerHeaderPresent = Boolean(req.headers.get("X-Leah-Worker-Secret"));

    if (workerHeaderPresent) {
      await requireWorker(req);

      if (action === "semantic.embed") {
        const taskId = uuid(body, "task_id");
        const leaseToken = uuid(body, "lease_token");
        const semanticId = uuid(body, "semantic_id");
        // begin() is the authoritative admission check immediately before provider dispatch.
        const memory = await embedForTask(taskId, leaseToken, semanticId);
        return json(req, { memory });
      }

      if (action === "semantic.recall") {
        const taskId = uuid(body, "task_id");
        const leaseToken = uuid(body, "lease_token");
        const query = text(body, "query", 20_000);
        const limit = boundedInteger(body.limit, 10, 1, 50, "limit");
        const minSimilarity = boundedNumber(body.min_similarity, 0.15, -1, 1, "min_similarity");
        // Do not spend an embedding-provider call for stale worker authority.
        await requireTaskLeaseBeforeProvider(taskId, leaseToken);
        const queryEmbedding = await embedLeahText(query);
        const { data, error } = await admin.rpc("leah_recall_semantic_for_task", {
          _task_id: taskId,
          _lease_token: leaseToken,
          _query_embedding_text: vectorLiteral(queryEmbedding.embedding),
          _match_count: limit,
          _min_similarity: minSimilarity,
        });
        if (error) throw error;
        return json(req, { memories: data ?? [] });
      }

      if (action === "semantic.dream") {
        const taskId = uuid(body, "task_id");
        const leaseToken = uuid(body, "lease_token");
        const sourceIds = uuidArray(body.source_ids, "source_ids");
        if (sourceIds.length < 2) throw new Error("source_ids must contain at least 2 memories");
        const sourceRef = text(body, "source_ref", 500);
        const chunk = text(body, "chunk", 100_000);
        const expiresAt = futureIso(body.expires_at);
        const { data: created, error: createError } = await admin.rpc("leah_create_dream_memory_for_task", {
          _task_id: taskId,
          _lease_token: leaseToken,
          _source_ids: sourceIds,
          _source_ref: sourceRef,
          _chunk: chunk,
          _expires_at: expiresAt,
        });
        if (createError) throw createError;
        const semanticId = String((created as Record<string, unknown>)?.id ?? "");
        if (!UUID_RE.test(semanticId)) throw new Error("Dream memory creation failed");
        const memory = await embedForTask(taskId, leaseToken, semanticId);
        return json(req, { memory, dream: true }, 201);
      }

      if (action === "semantic.expire") {
        const limit = boundedInteger(body.limit, 500, 1, 5000, "limit");
        const { data, error } = await admin.rpc("leah_expire_semantic_memories", { _limit: limit });
        if (error) throw error;
        return json(req, { expired: data ?? 0 });
      }

      throw new Error("Invalid worker semantic action");
    }

    const session = await resolveLeahSession(req, admin);
    const workspaceId = session.workspaceId;
    const actorId = session.userId;

    if (action === "semantic.remember") {
      const projectId = uuid(body, "project_id");
      const sourceRef = text(body, "source_ref", 500);
      const chunk = text(body, "chunk", 100_000);
      const memoryKindRaw = typeof body.memory_kind === "string" ? body.memory_kind.trim().toLowerCase() : "semantic";
      if (!MEMORY_KINDS.has(memoryKindRaw) || memoryKindRaw === "dream") throw new Error("Invalid memory_kind");
      const importance = boundedNumber(body.importance, 0.5, 0, 1, "importance");
      const confidence = boundedNumber(body.confidence, 0.5, 0, 1, "confidence");
      const expiresAt = futureIso(body.expires_at);
      await requireProject(workspaceId, projectId);
      const { data: row, error } = await admin.from("leah_semantic_memory").insert({
        workspace_id: workspaceId,
        project_id: projectId,
        source_ref: sourceRef,
        chunk,
        status: "pending",
        memory_kind: memoryKindRaw,
        importance_score: importance,
        confidence_score: confidence,
        expires_at: expiresAt,
        metadata: { created_by: "leah_session", actor_id: actorId },
      }).select("id").single();
      if (error) throw error;
      const memory = await embedForActor(workspaceId, actorId, row.id);
      return json(req, { memory }, 201);
    }

    if (action === "semantic.recall") {
      const projectId = uuid(body, "project_id");
      const query = text(body, "query", 20_000);
      const limit = boundedInteger(body.limit, 10, 1, 50, "limit");
      const minSimilarity = boundedNumber(body.min_similarity, 0.15, -1, 1, "min_similarity");
      await requireProject(workspaceId, projectId);
      const queryEmbedding = await embedLeahText(query);
      const { data, error } = await admin.rpc("leah_recall_semantic_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _project_id: projectId,
        _query_embedding_text: vectorLiteral(queryEmbedding.embedding),
        _match_count: limit,
        _min_similarity: minSimilarity,
      });
      if (error) throw error;
      return json(req, { memories: data ?? [] });
    }

    if (action === "semantic.forget") {
      const semanticId = uuid(body, "semantic_id");
      const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : "user_request";
      const { data, error } = await admin.rpc("leah_forget_semantic_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _semantic_id: semanticId,
        _reason: reason,
      });
      if (error) throw error;
      return json(req, { memory: data });
    }

    throw new Error("Invalid semantic action");
  } catch (error) {
    if (error instanceof LeahEmbeddingKnownError || error instanceof LeahEmbeddingUnknownOutcomeError) {
      return json(req, { error: safeProviderCode(error) }, safeProviderStatus(error));
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = publicErrorStatus(message);
    return json(req, { error: status === 500 ? "Internal LEAH semantic memory error" : message }, status);
  }
});
