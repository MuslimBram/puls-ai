import { createAdminClient } from "../_shared/admin-client.ts";
import { rejectWorkspaceInjection, resolveLeahSession } from "../_shared/leah-session.ts";
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
function optionalVersion(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error("Invalid expected_version");
  return n;
}
async function requireProject(workspaceId: string, projectId: string) {
  const { data, error } = await admin.from("leah_projects")
    .select("id").eq("id", projectId).eq("workspace_id", workspaceId).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Project not found");
}
function errorStatus(message: string): number {
  if (message === "LEAH session required" || message === "LEAH session invalid or expired") return 401;
  if (message.startsWith("Forbidden") || message.includes("access revoked") || message.includes("entitlement inactive")) return 403;
  if (message.toLowerCase().includes("not found") || message.includes("unavailable")) return 404;
  if (message.includes("conflict") || message.includes("awaiting approval")) return 409;
  if (message.includes("required") || message.includes("Invalid") || message.includes("must")) return 400;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const session = await resolveLeahSession(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    rejectWorkspaceInjection(body);
    const action = stringField(body, "action", 80);
    const workspaceId = session.workspaceId;
    const actorId = session.userId;

    if (action === "targets.list") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.from("leah_deployment_targets")
        .select("id,project_id,name,provider,environment,provider_project_ref,provider_account_ref,status,version,credential_secret_id,created_at,updated_at")
        .eq("workspace_id", workspaceId).eq("project_id", projectId)
        .order("environment").order("name");
      if (error) throw error;
      const targets = (data ?? []).map((row) => ({
        id: row.id,
        project_id: row.project_id,
        name: row.name,
        provider: row.provider,
        environment: row.environment,
        provider_project_ref: row.provider_project_ref,
        provider_account_ref: row.provider_account_ref,
        status: row.status,
        version: row.version,
        credential_configured: Boolean(row.credential_secret_id),
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      return json(req, { targets });
    }

    if (action === "targets.save") {
      const projectId = uuidField(body, "project_id");
      const targetId = optionalUuid(body.target_id, "target_id");
      const expectedVersion = optionalVersion(body.expected_version);
      const name = stringField(body, "name", 120);
      const provider = stringField(body, "provider", 40);
      const environment = stringField(body, "environment", 20);
      const providerProjectRef = stringField(body, "provider_project_ref", 200);
      const providerAccountRef = optionalString(body.provider_account_ref, 200, "provider_account_ref");
      const credentialSecretId = optionalUuid(body.credential_secret_id, "credential_secret_id");
      const status = stringField(body, "status", 20);
      const { data, error } = await admin.rpc("leah_save_deployment_target_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _project_id: projectId,
        _target_id: targetId,
        _expected_version: expectedVersion,
        _name: name,
        _provider: provider,
        _environment: environment,
        _provider_project_ref: providerProjectRef,
        _provider_account_ref: providerAccountRef,
        _credential_secret_id: credentialSecretId,
        _status: status,
      });
      if (error) throw error;
      return json(req, { target: data }, targetId ? 200 : 201);
    }

    if (action === "builds.list") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.from("leah_builds")
        .select("id,project_id,execution_id,task_id,build_key,status,source_manifest,source_manifest_hash,builder,builder_version,output_digest,output_metadata,error_code,started_at,completed_at,created_at,updated_at")
        .eq("workspace_id", workspaceId).eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json(req, { builds: data ?? [] });
    }

    if (action === "deployments.list") {
      const projectId = uuidField(body, "project_id");
      await requireProject(workspaceId, projectId);
      const { data, error } = await admin.from("leah_deployments")
        .select("id,project_id,build_id,target_id,target_version,provider,environment,provider_project_ref,provider_account_ref,request_key,requested_execution_id,requested_task_id,requested_by,status,approval_build_digest,approved_by,approved_at,rejected_by,rejected_at,executor_execution_id,executor_task_id,provider_ref,public_url,cost_micros,error_code,started_at,completed_at,unknown_since,created_at,updated_at")
        .eq("workspace_id", workspaceId).eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json(req, { deployments: data ?? [] });
    }

    if (action === "deployments.decide") {
      const deploymentId = uuidField(body, "deployment_id");
      const decision = stringField(body, "decision", 20);
      if (!new Set(["approve", "reject"]).has(decision)) throw new Error("Invalid deployment decision");
      const { data, error } = await admin.rpc("leah_decide_deployment_for_actor", {
        _workspace_id: workspaceId,
        _actor_id: actorId,
        _deployment_id: deploymentId,
        _decision: decision,
      });
      if (error) throw error;
      return json(req, { deployment: data });
    }

    throw new Error("Invalid developer-hub action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = errorStatus(message);
    return json(req, { error: status === 500 ? "Internal LEAH developer hub error" : message }, status);
  }
});
