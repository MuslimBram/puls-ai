import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";
import { rejectWorkspaceInjection, resolveLeahSession } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const admin = createAdminClient();
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function stringField(body: Record<string, unknown>, key: string, max = 1000): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function uuidField(body: Record<string, unknown>, key: string): string {
  const value = stringField(body, key, 64);
  if (!UUID_RE.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
}

function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid string value");
  return value;
}

function boundedInteger(value: unknown, min: number, max: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${label}`);
  return parsed;
}

function objectField(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function futureIso(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`Invalid ${label}`);
  if (time <= Date.now()) throw new Error(`${label} must be in the future`);
  return new Date(time).toISOString();
}

function slugify(name: string): string {
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const base = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "project";
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base}-${suffix}`;
}

async function requireProject(workspaceId: string, projectId: string) {
  const { data, error } = await admin.from("leah_projects")
    .select("id, workspace_id, status, version")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Project not found");
  return data;
}

async function requireWorkspaceAdmin(userId: string, workspaceId: string) {
  const { data, error } = await admin.rpc("has_workspace_role_for_user", {
    _user_id: userId,
    _workspace_id: workspaceId,
    _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: LEAH workspace admin required");
}

function errorStatus(message: string): number {
  if (message === "LEAH session required" || message === "LEAH session invalid or expired") return 401;
  if (
    message === "Forbidden" ||
    message.startsWith("Forbidden:") ||
    message.includes("access revoked") ||
    message.includes("access denied") ||
    message.includes("entitlement inactive") ||
    message.includes("entitlement expired")
  ) return 403;
  if (message.toLowerCase().includes("not found")) return 404;
  if (message.toLowerCase().includes("conflict") || message.toLowerCase().includes("terminal")) return 409;
  if (
    message.includes("required") ||
    message.includes("Invalid") ||
    message.includes("must not") ||
    message.includes("must be") ||
    message.includes("exceeds") ||
    message.includes("unsupported")
  ) return 400;
  return 500;
}

function publicError(message: string, status: number): string {
  return status === 500 ? "Internal LEAH error" : message;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const session = await resolveLeahSession(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    rejectWorkspaceInjection(body);
    const action = stringField(body, "action", 80);
    const workspaceId = session.workspaceId;
    const userId = session.userId;

    if (action === "session.revoke") {
      const { data, error } = await admin.from("leah_access_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("LEAH session not found");
      return json(req, { success: true });
    }

    if (action === "projects.list") {
      const { data, error } = await admin.from("leah_projects")
        .select("id, name, slug, description, goal, status, version, created_at, updated_at, archived_at")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return json(req, { projects: data ?? [] });
    }

    if (action === "projects.get") {
      const projectId = uuidField(body, "project_id");
      const { data, error } = await admin.from("leah_projects")
        .select("id, name, slug, description, goal, status, version, created_at, updated_at, archived_at")
        .eq("id", projectId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Project not found");
      return json(req, { project: data });
    }

    if (action === "projects.create") {
      const name = stringField(body, "name", 120);
      const description = optionalString(body.description, 10_000) ?? "";
      const goal = optionalString(body.goal, 10_000) ?? description;
      const { data, error } = await admin.from("leah_projects").insert({
        workspace_id: workspaceId,
        name,
        slug: slugify(name),
        description,
        goal,
        created_by: userId,
      }).select("id, name, slug, description, goal, status, version, created_at, updated_at").single();
      if (error) throw error;
      return json(req, { project: data }, 201);
    }

    if (action === "projects.update") {
      const projectId = uuidField(body, "project_id");
      const expectedVersion = Number(body.expected_version);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("expected_version is required");
      const patchRaw = body.patch;
      if (!patchRaw || typeof patchRaw !== "object" || Array.isArray(patchRaw)) throw new Error("patch is required");
      const patch = patchRaw as Record<string, unknown>;
      if (
        Object.prototype.hasOwnProperty.call(patch, "workspace_id") ||
        Object.prototype.hasOwnProperty.call(patch, "workspaceId") ||
        Object.prototype.hasOwnProperty.call(patch, "status") ||
        Object.prototype.hasOwnProperty.call(patch, "archived_at")
      ) {
        throw new Error("unsupported server-managed project field");
      }

      const update: Record<string, unknown> = {
        version: expectedVersion + 1,
        updated_at: new Date().toISOString(),
      };
      if (patch.name !== undefined) update.name = stringField(patch, "name", 120);
      if (patch.description !== undefined) update.description = optionalString(patch.description, 10_000) ?? "";
      if (patch.goal !== undefined) update.goal = optionalString(patch.goal, 10_000) ?? "";
      if (Object.keys(update).length === 2) throw new Error("No supported fields in patch");

      const { data, error } = await admin.from("leah_projects").update(update)
        .eq("id", projectId)
        .eq("workspace_id", workspaceId)
        .eq("version", expectedVersion)
        .is("archived_at", null)
        .select("id, name, slug, description, goal, status, version, created_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Version conflict or project not found");
      return json(req, { project: data });
    }

    if (action === "projects.archive") {
      const projectId = uuidField(body, "project_id");
      const expectedVersion = Number(body.expected_version);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("expected_version is required");
      const now = new Date().toISOString();
      const { data, error } = await admin.from("leah_projects").update({
        status: "archived",
        archived_at: now,
        updated_at: now,
        version: expectedVersion + 1,
      }).eq("id", projectId).eq("workspace_id", workspaceId).eq("version", expectedVersion)
        .is("archived_at", null)
        .select("id, status, version, archived_at").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Version conflict or project not found");
      return json(req, { project: data });
    }

    if (action === "artifacts.list") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.from("leah_project_artifacts")
        .select("id, project_id, execution_id, task_id, kind, path, content, content_hash, storage_ref, version, supersedes_id, created_at")
        .eq("workspace_id", workspaceId).eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json(req, { artifacts: data ?? [] });
    }

    if (action === "executions.start") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      let idempotencyKey: string | null = null;
      if (body.idempotency_key !== undefined && body.idempotency_key !== null) {
        if (typeof body.idempotency_key !== "string" || body.idempotency_key.length > 200) {
          throw new Error("Invalid idempotency_key");
        }
        idempotencyKey = body.idempotency_key.trim() || null;
      }
      const input = objectField(body.input, "input");
      const { data, error } = await admin.rpc("leah_start_execution", {
        _workspace_id: workspaceId,
        _project_id: projectId,
        _requested_by: userId,
        _idempotency_key: idempotencyKey,
        _input: input,
      });
      if (error) throw error;
      const replay = Boolean(data && typeof data === "object" && (data as Record<string, unknown>).idempotent_replay);
      return json(req, data, replay ? 200 : 201);
    }

    if (action === "executions.list") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.from("leah_executions")
        .select("id, project_id, requested_by, status, idempotency_key, attempt, error_code, error_detail, started_at, ended_at, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json(req, { executions: data ?? [] });
    }

    if (action === "tasks.list") {
      const executionId = uuidField(body, "execution_id");
      const { data: execution, error: executionError } = await admin.from("leah_executions")
        .select("id")
        .eq("id", executionId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (executionError) throw executionError;
      if (!execution) throw new Error("Execution not found");
      const { data, error } = await admin.from("leah_tasks")
        .select("id, execution_id, project_id, parent_task_id, swarm_id, agent_role, seq, priority, status, attempt, max_attempts, available_at, started_at, ended_at, output, error, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("execution_id", executionId)
        .order("seq");
      if (error) throw error;
      return json(req, { tasks: data ?? [] });
    }

    if (action === "schedules.list") {
      const projectId = body.project_id === undefined ? null : uuidField(body, "project_id");
      let query = admin.from("leah_schedules")
        .select("id, project_id, name, cadence_seconds, enabled, input, next_run_at, last_run_at, last_execution_id, created_by, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .order("next_run_at", { ascending: true });
      if (projectId) query = query.eq("project_id", projectId);
      const { data, error } = await query;
      if (error) throw error;
      return json(req, { schedules: data ?? [] });
    }

    if (action === "schedules.create") {
      await requireWorkspaceAdmin(userId, workspaceId);
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const name = stringField(body, "name", 120);
      const cadenceSeconds = boundedInteger(body.cadence_seconds, 60, 31_536_000, "cadence_seconds");
      const input = objectField(body.input, "input");
      const nextRunAt = body.next_run_at === undefined
        ? new Date(Date.now() + cadenceSeconds * 1000).toISOString()
        : futureIso(body.next_run_at, "next_run_at");
      const { data, error } = await admin.from("leah_schedules").insert({
        workspace_id: workspaceId,
        project_id: projectId,
        name,
        cadence_seconds: cadenceSeconds,
        enabled: body.enabled === undefined ? true : body.enabled === true,
        input,
        next_run_at: nextRunAt,
        created_by: userId,
      }).select("id, project_id, name, cadence_seconds, enabled, input, next_run_at, last_run_at, last_execution_id, created_by, created_at, updated_at").single();
      if (error) throw error;
      return json(req, { schedule: data }, 201);
    }

    if (action === "schedules.update") {
      await requireWorkspaceAdmin(userId, workspaceId);
      const scheduleId = uuidField(body, "schedule_id");
      const patchRaw = body.patch;
      if (!patchRaw || typeof patchRaw !== "object" || Array.isArray(patchRaw)) throw new Error("patch is required");
      const patch = patchRaw as Record<string, unknown>;
      const forbidden = ["workspace_id", "workspaceId", "project_id", "created_by", "last_run_at", "last_execution_id", "created_at"];
      if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(patch, key))) {
        throw new Error("unsupported server-managed schedule field");
      }
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) update.name = stringField(patch, "name", 120);
      if (patch.cadence_seconds !== undefined) {
        update.cadence_seconds = boundedInteger(patch.cadence_seconds, 60, 31_536_000, "cadence_seconds");
      }
      if (patch.enabled !== undefined) {
        if (typeof patch.enabled !== "boolean") throw new Error("Invalid enabled value");
        update.enabled = patch.enabled;
      }
      if (patch.input !== undefined) update.input = objectField(patch.input, "input");
      if (patch.next_run_at !== undefined) update.next_run_at = futureIso(patch.next_run_at, "next_run_at");
      if (Object.keys(update).length === 1) throw new Error("No supported fields in patch");

      const { data, error } = await admin.from("leah_schedules").update(update)
        .eq("id", scheduleId)
        .eq("workspace_id", workspaceId)
        .select("id, project_id, name, cadence_seconds, enabled, input, next_run_at, last_run_at, last_execution_id, created_by, created_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Schedule not found");
      return json(req, { schedule: data });
    }

    if (action === "schedules.delete") {
      await requireWorkspaceAdmin(userId, workspaceId);
      const scheduleId = uuidField(body, "schedule_id");
      const { data, error } = await admin.from("leah_schedules").delete()
        .eq("id", scheduleId)
        .eq("workspace_id", workspaceId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Schedule not found");
      return json(req, { success: true });
    }

    if (action === "memory.project.list") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.from("leah_project_memory")
        .select("id, project_id, key, value, version, created_at, updated_at")
        .eq("workspace_id", workspaceId).eq("project_id", projectId).order("key");
      if (error) throw error;
      return json(req, { memory: data ?? [] });
    }

    if (action === "memory.project.upsert") {
      const projectId = uuidField(body, "project_id");
      const key = stringField(body, "key", 200);
      if (body.value === undefined) throw new Error("value is required");
      await requireProject(workspaceId, projectId);
      const { data: existing, error: existingError } = await admin.from("leah_project_memory")
        .select("id, version").eq("workspace_id", workspaceId).eq("project_id", projectId).eq("key", key).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const { data, error } = await admin.from("leah_project_memory").update({
          value: body.value,
          version: existing.version + 1,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id).eq("workspace_id", workspaceId).eq("version", existing.version)
          .select("id, project_id, key, value, version, updated_at").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Memory version conflict");
        return json(req, { memory: data });
      }
      const { data, error } = await admin.from("leah_project_memory").insert({
        workspace_id: workspaceId, project_id: projectId, key, value: body.value, updated_by: userId,
      }).select("id, project_id, key, value, version, updated_at").single();
      if (error?.code === "23505") throw new Error("Memory version conflict");
      if (error) throw error;
      return json(req, { memory: data }, 201);
    }

    if (action === "semantic.enqueue") {
      const projectId = uuidField(body, "project_id");
      const sourceRef = stringField(body, "source_ref", 500);
      const chunk = stringField(body, "chunk", 100_000);
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.from("leah_semantic_memory").insert({
        workspace_id: workspaceId,
        project_id: projectId,
        source_ref: sourceRef,
        chunk,
        status: "pending",
        metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
      }).select("id, project_id, source_ref, status, created_at").single();
      if (error) throw error;
      return json(req, { memory: data, vector_ready: false }, 201);
    }

    if (action === "preferences.list") {
      const { data, error } = await admin.from("leah_preferences")
        .select("id, user_id, scope, key, value, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order("scope").order("key");
      if (error) throw error;
      return json(req, { preferences: data ?? [] });
    }

    if (action === "preferences.upsert") {
      const scope = stringField(body, "scope", 80);
      const key = stringField(body, "key", 200);
      if (body.value === undefined) throw new Error("value is required");
      const userScoped = body.user_scoped !== false;
      if (!userScoped) await requireWorkspaceAdmin(userId, workspaceId);
      const targetUser = userScoped ? userId : null;
      let query = admin.from("leah_preferences").select("id")
        .eq("workspace_id", workspaceId).eq("scope", scope).eq("key", key);
      query = targetUser ? query.eq("user_id", targetUser) : query.is("user_id", null);
      const { data: existing, error: existingError } = await query.maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const { data, error } = await admin.from("leah_preferences").update({
          value: body.value, updated_by: userId, updated_at: new Date().toISOString(),
        }).eq("id", existing.id).eq("workspace_id", workspaceId)
          .select("id, user_id, scope, key, value, updated_at").single();
        if (error) throw error;
        return json(req, { preference: data });
      }
      const { data, error } = await admin.from("leah_preferences").insert({
        workspace_id: workspaceId, user_id: targetUser, scope, key, value: body.value, updated_by: userId,
      }).select("id, user_id, scope, key, value, updated_at").single();
      if (error?.code === "23505") throw new Error("Preference conflict");
      if (error) throw error;
      return json(req, { preference: data }, 201);
    }

    if (action === "secrets.list") {
      await requireWorkspaceAdmin(userId, workspaceId);
      const { data, error } = await admin.from("leah_secret_registry")
        .select("id, alias, provider, hint, status, version, rotated_from, created_at, revoked_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false });
      if (error) throw error;
      return json(req, { secrets: data ?? [] });
    }

    if (action === "secrets.create") {
      await requireWorkspaceAdmin(userId, workspaceId);
      const alias = stringField(body, "alias", 100);
      const provider = stringField(body, "provider", 100);
      const secretValue = stringField(body, "secret", 20_000);
      const { data, error } = await admin.rpc("leah_vault_create", {
        _workspace_id: workspaceId,
        _user_id: userId,
        _alias: alias,
        _provider: provider,
        _secret_value: secretValue,
      });
      if (error) throw error;
      return json(req, { secret: data }, 201);
    }

    if (action === "secrets.rotate") {
      await requireWorkspaceAdmin(userId, workspaceId);
      const secretId = uuidField(body, "secret_id");
      const secretValue = stringField(body, "secret", 20_000);
      const { data, error } = await admin.rpc("leah_vault_rotate", {
        _workspace_id: workspaceId,
        _user_id: userId,
        _secret_id: secretId,
        _secret_value: secretValue,
      });
      if (error) throw error;
      return json(req, { secret: data });
    }

    if (action === "secrets.revoke") {
      await requireWorkspaceAdmin(userId, workspaceId);
      const secretId = uuidField(body, "secret_id");
      const { data, error } = await admin.rpc("leah_vault_revoke", {
        _workspace_id: workspaceId,
        _user_id: userId,
        _secret_id: secretId,
      });
      if (error) throw error;
      if (!data) throw new Error("Secret not found or already revoked");
      return json(req, { success: true });
    }

    throw new Error("Unknown LEAH action");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = errorStatus(message);
    return json(req, { error: publicError(message, status) }, status);
  }
});