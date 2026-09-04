import { createAdminClient } from "../_shared/admin-client.ts";
import { rejectWorkspaceInjection, resolveLeahSession } from "../_shared/leah-session.ts";
import { requireLeahWorker } from "../_shared/leah-worker-auth.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const admin = createAdminClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function field(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${key} is required`);
  return value.trim();
}
function uuidField(body: Record<string, unknown>, key: string): string {
  const value = field(body, key, 64);
  if (!UUID_RE.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
}
function optionalUuid(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${label} must be a UUID`);
  return value;
}
function integer(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${label}`);
  return n;
}
function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function statusFor(message: string): number {
  if (message === "Worker authentication failed" || message === "LEAH session required" || message === "LEAH session invalid or expired") return 401;
  if (message.startsWith("Forbidden") || message.includes("access revoked") || message.includes("entitlement inactive")) return 403;
  if (message.toLowerCase().includes("not found")) return 404;
  if (message.includes("CONFLICT") || message.includes("not authorized") || message.includes("awaiting approval")) return 409;
  if (message.includes("required") || message.includes("Invalid") || message.includes("forbidden") || message.includes("must")) return 400;
  return 500;
}
async function requireProject(workspaceId: string, projectId: string): Promise<void> {
  const { data, error } = await admin.from("leah_projects")
    .select("id").eq("workspace_id", workspaceId).eq("id", projectId).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Project not found");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    rejectWorkspaceInjection(body);
    const action = field(body, "action", 80);
    const workerHeaderPresent = Boolean(req.headers.get("X-Leah-Worker-Secret"));

    if (workerHeaderPresent) {
      await requireLeahWorker(req);
      if (action !== "events.emit") throw new Error("Invalid worker observability action");

      const taskId = uuidField(body, "task_id");
      const leaseToken = uuidField(body, "lease_token");
      const eventKey = field(body, "event_key", 240);
      const traceId = uuidField(body, "trace_id");
      const spanId = uuidField(body, "span_id");
      const parentSpanId = optionalUuid(body.parent_span_id, "parent_span_id");
      const category = field(body, "category", 40);
      const severity = field(body, "severity", 20);
      const eventName = field(body, "event_name", 160);
      const attributes = objectValue(body.attributes, "attributes");
      const { data, error } = await admin.rpc("leah_emit_observability_for_task", {
        _task_id: taskId,
        _lease_token: leaseToken,
        _event_key: eventKey,
        _trace_id: traceId,
        _span_id: spanId,
        _parent_span_id: parentSpanId,
        _category: category,
        _severity: severity,
        _event_name: eventName,
        _attributes: attributes,
      });
      if (error) throw error;
      return json(req, { event: data }, 201);
    }

    const session = await resolveLeahSession(req, admin);
    const workspaceId = session.workspaceId;
    const actorId = session.userId;

    if (action === "events.list") {
      const projectId = uuidField(body, "project_id");
      const limit = integer(body.limit, 100, 1, 500, "limit");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.rpc("leah_list_observability_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _project_id: projectId,
        _limit: limit,
      });
      if (error) throw error;
      return json(req, { events: data ?? [] });
    }

    if (action === "health.get") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.rpc("leah_runtime_health_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _project_id: projectId,
      });
      if (error) throw error;
      return json(req, { health: data });
    }

    if (action === "recovery.list") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.rpc("leah_list_recovery_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _project_id: projectId,
      });
      if (error) throw error;
      return json(req, data ?? { checkpoints: [], drills: [], plans: [] });
    }

    if (action === "recovery.checkpoint.create") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.rpc("leah_create_recovery_checkpoint_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _project_id: projectId,
      });
      if (error) throw error;
      return json(req, { checkpoint: data }, 201);
    }

    if (action === "recovery.checkpoint.verify") {
      const checkpointId = uuidField(body, "checkpoint_id");
      const { data, error } = await admin.rpc("leah_verify_recovery_checkpoint_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _checkpoint_id: checkpointId,
      });
      if (error) throw error;
      return json(req, { verification: data });
    }

    if (action === "recovery.drill.run") {
      const checkpointId = uuidField(body, "checkpoint_id");
      const { data, error } = await admin.rpc("leah_run_recovery_drill_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _checkpoint_id: checkpointId,
      });
      if (error) throw error;
      return json(req, { drill: data }, 201);
    }

    if (action === "recovery.plan.prepare") {
      const checkpointId = uuidField(body, "checkpoint_id");
      const environment = field(body, "environment", 20);
      const { data, error } = await admin.rpc("leah_prepare_recovery_plan_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _checkpoint_id: checkpointId,
        _environment: environment,
      });
      if (error) throw error;
      return json(req, { plan: data }, 201);
    }

    if (action === "recovery.plan.decide") {
      const planId = uuidField(body, "plan_id");
      const decision = field(body, "decision", 20);
      const { data, error } = await admin.rpc("leah_decide_recovery_plan_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _plan_id: planId,
        _decision: decision,
      });
      if (error) throw error;
      return json(req, { plan: data });
    }

    if (action === "recovery.plan.verify") {
      const planId = uuidField(body, "plan_id");
      const { data, error } = await admin.rpc("leah_verify_recovery_plan_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _plan_id: planId,
      });
      if (error) throw error;
      return json(req, { plan: data });
    }

    throw new Error("Invalid LEAH observability action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = statusFor(message);
    return json(req, { error: status === 500 ? "Internal LEAH observability error" : message }, status);
  }
});
