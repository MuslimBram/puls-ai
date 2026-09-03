import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";

const admin = createAdminClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXECUTION_TRANSITIONS: Record<string, Set<string>> = {
  queued: new Set(["running", "failed", "cancelled"]),
  running: new Set(["succeeded", "failed", "cancelled"]),
};

const TASK_TRANSITIONS: Record<string, Set<string>> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set(["succeeded", "failed", "retry_wait", "cancelled"]),
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

async function executionById(executionId: string) {
  const { data, error } = await admin.from("leah_executions")
    .select("id, workspace_id, project_id, requested_by, status")
    .eq("id", executionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Execution not found");
  return data;
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
      if (!EXECUTION_TRANSITIONS[fromStatus]?.has(toStatus)) throw new Error("Invalid execution transition");
      const execution = await executionById(executionId);
      if (execution.status !== fromStatus) throw new Error("Execution state conflict");

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status: toStatus, updated_at: now };
      if (toStatus === "running") patch.started_at = now;
      if (["succeeded", "failed", "cancelled"].includes(toStatus)) patch.ended_at = now;
      if (toStatus === "failed") {
        patch.error_code = typeof body.error_code === "string" ? body.error_code.slice(0, 100) : "execution_failed";
        patch.error_detail = body.error_detail && typeof body.error_detail === "object" ? body.error_detail : { message: "Execution failed" };
      }

      const { data, error } = await admin.from("leah_executions").update(patch)
        .eq("id", execution.id)
        .eq("workspace_id", execution.workspace_id)
        .eq("status", fromStatus)
        .select("id, project_id, status, error_code, error_detail, started_at, ended_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Execution state conflict");
      return json({ execution: data });
    }

    if (action === "tasks.add") {
      const executionId = uuidField(body, "execution_id");
      const execution = await executionById(executionId);
      if (["succeeded", "failed", "cancelled"].includes(execution.status)) throw new Error("Execution is terminal");
      const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
      const priorityNumber = Number(body.priority ?? 100);
      const priority = Number.isInteger(priorityNumber) ? Math.max(-10_000, Math.min(10_000, priorityNumber)) : 100;

      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: latest, error: latestError } = await admin.from("leah_tasks")
          .select("seq")
          .eq("workspace_id", execution.workspace_id)
          .eq("execution_id", execution.id)
          .order("seq", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestError) throw latestError;
        const seq = (latest?.seq ?? -1) + 1;
        const { data, error } = await admin.from("leah_tasks").insert({
          workspace_id: execution.workspace_id,
          execution_id: execution.id,
          project_id: execution.project_id,
          seq,
          priority,
          input,
        }).select("id, execution_id, project_id, seq, priority, status, attempt, available_at, created_at").single();
        if (!error) return json({ task: data }, 201);
        if (error.code !== "23505" || attempt === 4) throw error;
      }
      throw new Error("Task sequence allocation failed");
    }

    if (action === "tasks.transition") {
      const taskId = uuidField(body, "task_id");
      const fromStatus = stringField(body, "from_status", 40);
      const toStatus = stringField(body, "to_status", 40);
      if (!TASK_TRANSITIONS[fromStatus]?.has(toStatus)) throw new Error("Invalid task transition");
      const task = await taskById(taskId);
      if (task.status !== fromStatus) throw new Error("Task state conflict");

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status: toStatus, updated_at: now };
      if (toStatus === "running") {
        patch.started_at = now;
        patch.ended_at = null;
        patch.attempt = task.attempt + 1;
      }
      if (["succeeded", "failed", "cancelled"].includes(toStatus)) patch.ended_at = now;
      if (toStatus === "succeeded") {
        patch.output = body.output === undefined ? {} : body.output;
        patch.error = null;
      }
      if (toStatus === "failed") patch.error = body.error === undefined ? { message: "Task failed" } : body.error;
      if (toStatus === "retry_wait") {
        const rawDelay = Number(body.retry_delay_ms ?? 1000);
        const delayMs = Number.isFinite(rawDelay) ? Math.max(0, Math.min(86_400_000, rawDelay)) : 1000;
        patch.available_at = new Date(Date.now() + delayMs).toISOString();
        patch.error = body.error === undefined ? { message: "Retry scheduled" } : body.error;
      }
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

    if (action === "artifacts.put") {
      const executionId = uuidField(body, "execution_id");
      const execution = await executionById(executionId);
      if (execution.status !== "running") throw new Error("Execution is not producing artifacts");
      const kind = stringField(body, "kind", 80);
      const path = stringField(body, "path", 500);
      const content = typeof body.content === "string" ? body.content : "";
      if (content.length > 1_000_000) throw new Error("Artifact content exceeds 1 MB; use object storage");
      const hash = await contentHash(content);

      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: latest, error: latestError } = await admin.from("leah_project_artifacts")
          .select("id, version")
          .eq("workspace_id", execution.workspace_id)
          .eq("project_id", execution.project_id)
          .eq("path", path)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestError) throw latestError;
        const nextVersion = (latest?.version ?? 0) + 1;
        const { data, error } = await admin.from("leah_project_artifacts").insert({
          workspace_id: execution.workspace_id,
          project_id: execution.project_id,
          kind,
          path,
          content,
          content_hash: hash,
          version: nextVersion,
          supersedes_id: latest?.id ?? null,
          created_by: execution.requested_by,
        }).select("id, project_id, kind, path, content_hash, version, supersedes_id, created_at").single();
        if (!error) return json({ artifact: data }, 201);
        if (error.code !== "23505" || attempt === 4) throw error;
      }
      throw new Error("Artifact version allocation failed");
    }

    if (action === "projects.transition") {
      const executionId = uuidField(body, "execution_id");
      const fromStatus = stringField(body, "from_status", 40);
      const toStatus = stringField(body, "to_status", 40);
      if (!PROJECT_TRANSITIONS[fromStatus]?.has(toStatus)) throw new Error("Invalid project transition");
      const execution = await executionById(executionId);
      const { data: current, error: currentError } = await admin.from("leah_projects")
        .select("id, status, version")
        .eq("id", execution.project_id)
        .eq("workspace_id", execution.workspace_id)
        .is("archived_at", null)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) throw new Error("Project not found");
      if (current.status !== fromStatus) throw new Error("Project state conflict");
      const now = new Date().toISOString();
      const { data, error } = await admin.from("leah_projects").update({
        status: toStatus,
        version: current.version + 1,
        updated_at: now,
      })
        .eq("id", current.id)
        .eq("workspace_id", execution.workspace_id)
        .eq("status", fromStatus)
        .eq("version", current.version)
        .is("archived_at", null)
        .select("id, status, version, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Project state conflict");
      return json({ project: data });
    }

    if (action === "semantic.mark") {
      const semanticId = uuidField(body, "semantic_id");
      const status = stringField(body, "status", 20);
      if (!new Set(["embedded", "failed"]).has(status)) throw new Error("Invalid semantic status");
      const { data: row, error: rowError } = await admin.from("leah_semantic_memory")
        .select("id, workspace_id, project_id, status")
        .eq("id", semanticId)
        .maybeSingle();
      if (rowError) throw rowError;
      if (!row) throw new Error("Semantic memory not found");
      if (row.status !== "pending") throw new Error("Semantic memory state conflict");

      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "embedded") {
        patch.provider = stringField(body, "provider", 100);
        patch.provider_ref = stringField(body, "provider_ref", 500);
        patch.embedding_ref = stringField(body, "embedding_ref", 1000);
        patch.error = null;
      } else {
        patch.error = body.error && typeof body.error === "object" ? body.error : { message: "Embedding failed" };
      }
      const { data, error } = await admin.from("leah_semantic_memory").update(patch)
        .eq("id", row.id)
        .eq("workspace_id", row.workspace_id)
        .eq("status", "pending")
        .select("id, project_id, status, provider, provider_ref, embedding_ref, error, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Semantic memory state conflict");
      return json({ memory: data });
    }

    if (action === "secrets.read_for_execution") {
      const executionId = uuidField(body, "execution_id");
      const secretId = uuidField(body, "secret_id");
      const execution = await executionById(executionId);
      if (execution.status !== "running") throw new Error("Execution is not running");
      const { data, error } = await admin.rpc("leah_vault_read_for_runtime", {
        _workspace_id: execution.workspace_id,
        _user_id: execution.requested_by,
        _secret_id: secretId,
        _execution_id: execution.id,
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
      message.toLowerCase().includes("conflict") || message.toLowerCase().includes("terminal") ? 409 :
      message.includes("required") || message.includes("Invalid") || message.includes("must") || message.includes("exceeds") || message.includes("not producing") || message.includes("not running") ? 400 : 500;
    return json({ error: message }, status);
  }
});
