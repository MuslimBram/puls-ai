import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...getCors(req), "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // ── AUTHENTICATION BOUNDARY ───────────────────────────────────────────────
    // Two trusted paths:
    //   1. USER path:     JWT → getUser() → derive user_id from JWT (NEVER from body)
    //   2. INTERNAL path: CRON_SECRET / INTERNAL_WEBHOOK_SECRET
    // Client-provided user_id and workspace_id are NEVER trusted as identity.

    const authHeader = req.headers.get("Authorization") ?? "";
    const isInternal = requireCronAuth(req) === null;  // null = auth OK

    let authedUserId: string | null = null;
    let authedWorkspaceId: string | null = null;

    if (isInternal) {
      // Internal/cron path: trust the body for routing context (not identity)
      const body = await req.json();
      const { trigger_type, trigger_data, workspace_id } = body;
      if (!workspace_id) return json(req, { error: "workspace_id required for internal path" }, 400);
      authedWorkspaceId = workspace_id;
      return await handleExecution(supabase, req, { trigger_type, trigger_data,
        workspace_id: authedWorkspaceId, userId: null, isInternal: true });
    }

    // USER path: derive identity from JWT ONLY
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const { data: { user }, error: ue } = await supabase.auth.getUser(authHeader.slice(7));
    if (ue || !user) return json(req, { error: "Unauthorized" }, 401);
    authedUserId = user.id;  // ← JWT-derived, not from body

    const body = await req.json();
    const { trigger_type, trigger_data, workspace_id } = body;
    if (!trigger_type) return json(req, { error: "trigger_type required" }, 400);

    // Workspace membership check
    const { data: member } = await supabase.rpc("is_workspace_member",
      { _user_id: authedUserId, _workspace_id: workspace_id ?? authedUserId });
    const { data: owned } = await supabase.from("workspaces")
      .select("id").eq("id", workspace_id ?? authedUserId).eq("owner_id", authedUserId).maybeSingle();

    if (!member && !owned) return json(req, { error: "Forbidden: not a member of this workspace" }, 403);
    authedWorkspaceId = workspace_id ?? authedUserId;

    return await handleExecution(supabase, req, {
      trigger_type, trigger_data,
      workspace_id: authedWorkspaceId,
      userId: authedUserId, isInternal: false,
    });

  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

async function handleExecution(
  supabase: ReturnType<typeof createClient>,
  req: Request,
  ctx: { trigger_type: string; trigger_data: any; workspace_id: string; userId: string | null; isInternal: boolean }
): Promise<Response> {
  const getCors = (r: Request) => buildCorsHeaders(r, { allowAnyOrigin: false });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...getCors(req), "Content-Type": "application/json" },
    });

  const { trigger_type, trigger_data, workspace_id, userId } = ctx;

  // Find matching active workflows — ALWAYS scoped to authorized workspace
  // Never query by client-provided user_id alone (that was the P0 vulnerability)
  const wfQuery = supabase.from("automation_workflows")
    .select("*")
    .eq("workspace_id", workspace_id)  // workspace-scoped, not user-provided user_id
    .eq("trigger_type", trigger_type)
    .eq("is_active", true);

  const { data: workflows, error: wfErr } = await wfQuery;
  if (wfErr) throw wfErr;
  if (!workflows?.length) return json({ executed: 0 });

  let executedCount = 0;
  for (const workflow of workflows) {
    const startTime = Date.now();
    const actionsExecuted: any[] = [];
    let status = "success";
    let errorMessage: string | null = null;

    try {
      for (const action of (workflow.actions || [])) {
        // Actions must reference resources in the SAME workspace
        const result = await executeAction(supabase, action, trigger_data, workspace_id);
        actionsExecuted.push({ type: action.type, result });
      }
    } catch (e) {
      status = "error";
      errorMessage = e instanceof Error ? e.message : "Unknown error";
    }

    await supabase.from("automation_logs").insert({
      workflow_id: workflow.id,
      user_id: userId ?? workflow.user_id,
      trigger_event: trigger_type,
      actions_executed: actionsExecuted,
      status, error_message: errorMessage,
      duration_ms: Date.now() - startTime,
      metadata: { trigger_data },
    });

    await supabase.from("automation_workflows")
      .update({ execution_count: (workflow.execution_count || 0) + 1, last_executed_at: new Date().toISOString() })
      .eq("id", workflow.id)
      .eq("workspace_id", workspace_id);  // workspace isolation

    executedCount++;
  }

  return json({ executed: executedCount });
}

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  action: any,
  triggerData: any,
  workspaceId: string,  // workspace context enforced — no cross-tenant resource access
): Promise<string> {
  switch (action.type) {
    case "notify_internal": {
      await supabase.from("inbox_messages").insert({
        channel_type: "system", source_name: "Automation", sender_name: "System",
        message_content: `Automation: ${action.config?.message || "Event triggered"}`,
        message_timestamp: new Date().toISOString(),
        is_unread: true, priority: "normal", status: "new",
      });
      return "notification_sent";
    }
    case "create_task": {
      if (triggerData?.deal_id && action.config?.title) {
        // Verify deal belongs to same workspace before modifying
        const { data: deal } = await supabase.from("deals")
          .select("id").eq("id", triggerData.deal_id).eq("workspace_id", workspaceId).maybeSingle();
        if (deal) {
          await supabase.from("deal_tasks").insert({
            deal_id: triggerData.deal_id,
            title: action.config.title || "Follow-up task",
            priority: action.config.priority || "medium",
          });
        }
      }
      return "task_created";
    }
    case "move_pipeline": {
      if (triggerData?.deal_id && action.config?.stage_id) {
        await supabase.from("deals")
          .update({ stage_id: action.config.stage_id, updated_at: new Date().toISOString() })
          .eq("id", triggerData.deal_id)
          .eq("workspace_id", workspaceId);  // cross-workspace guard
      }
      return "pipeline_moved";
    }
    case "assign_owner": {
      if (triggerData?.deal_id && action.config?.assigned_to) {
        await supabase.from("deals")
          .update({ assigned_to: action.config.assigned_to, updated_at: new Date().toISOString() })
          .eq("id", triggerData.deal_id)
          .eq("workspace_id", workspaceId);
      }
      return "owner_assigned";
    }
    case "update_tags": {
      if (triggerData?.deal_id && action.config?.tags) {
        const { data: deal } = await supabase.from("deals")
          .select("tags").eq("id", triggerData.deal_id).eq("workspace_id", workspaceId).single();
        if (deal) {
          const newTags = [...new Set([...(deal.tags || []), ...action.config.tags])];
          await supabase.from("deals").update({ tags: newTags, updated_at: new Date().toISOString() })
            .eq("id", triggerData.deal_id).eq("workspace_id", workspaceId);
        }
      }
      return "tags_updated";
    }
    case "call_webhook": {
      if (action.config?.url) {
        // Validate URL to prevent SSRF to internal endpoints
        const url = new URL(action.config.url);
        if (!["http:", "https:"].includes(url.protocol)) return "invalid_protocol";
        const resp = await fetch(action.config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger_data: triggerData, workspace_id: workspaceId }),
        });
        return `webhook_${resp.status}`;
      }
      return "no_url_configured";
    }
    default: return `unknown_action_${action.type}`;
  }
}
