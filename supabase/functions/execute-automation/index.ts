import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { evaluateServerAdsRisk } from "../_shared/ai-guard-server.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";

interface CustomApprovalError extends Error {
  status?: string;
  approval_reference?: string;
  approval_payload?: Record<string, unknown>;
}

interface ActionPayload {
  type: string;
  provider?: "meta_ads" | "google_ads" | "tiktok_ads";
  ad_account_id?: string;
  campaign_id?: string;
  channel_id?: string;
  message_content?: string;
  reply_to_message_id?: string;
  webhook_url?: string;
}

interface TriggerData {
  provider?: "meta_ads" | "google_ads" | "tiktok_ads";
  ad_account_id?: string;
  campaign_id?: string;
  current_spend?: number;
  baseline_spend?: number;
  auth_anomaly?: boolean;
  token_anomaly?: boolean;
  message_content?: string;
  channel_id?: string;
}

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    // ── AUTHENTICATION BOUNDARY ───────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const isInternal = requireCronAuth(req) === null; // null = auth OK

    let authedUserId: string | null = null;
    let authedWorkspaceId: string | null = null;

    if (isInternal) {
      const body = await req.json();
      const { trigger_type, trigger_data, workspace_id } = body;
      if (!workspace_id) return json(req, { error: "workspace_id required for internal path" }, 400);
      authedWorkspaceId = workspace_id;
      return await handleExecution(supabase, req, {
        trigger_type,
        trigger_data,
        workspace_id: authedWorkspaceId,
        userId: null,
        isInternal: true,
      });
    }

    // USER path: derive identity from JWT ONLY
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const {
      data: { user },
      error: ue,
    } = await supabase.auth.getUser(authHeader.slice(7));
    if (ue || !user) return json(req, { error: "Unauthorized" }, 401);
    authedUserId = user.id;

    const body = await req.json();
    const { trigger_type, trigger_data, workspace_id } = body;
    if (!trigger_type) return json(req, { error: "trigger_type required" }, 400);
    if (!workspace_id) return json(req, { error: "workspace_id required" }, 400);

    // Workspace membership check (No user.id fallback!)
    const { data: member } = await supabase.rpc("is_workspace_member", {
      _user_id: authedUserId,
      _workspace_id: workspace_id,
    });
    const { data: owned } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspace_id)
      .eq("owner_id", authedUserId)
      .maybeSingle();

    if (!member && !owned) return json(req, { error: "Forbidden: not a member of this workspace" }, 403);
    authedWorkspaceId = workspace_id;

    return await handleExecution(supabase, req, {
      trigger_type,
      trigger_data,
      workspace_id: authedWorkspaceId,
      userId: authedUserId,
      isInternal: false,
    });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

async function handleExecution(
  supabase: ReturnType<typeof createClient>,
  req: Request,
  ctx: { trigger_type: string; trigger_data: TriggerData; workspace_id: string; userId: string | null; isInternal: boolean }
): Promise<Response> {
  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });

  const { trigger_type, trigger_data, workspace_id, userId } = ctx;

  const wfQuery = supabase
    .from("automation_workflows")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("trigger_type", trigger_type)
    .eq("is_active", true);

  const { data: workflows, error: wfErr } = await wfQuery;
  if (wfErr) throw wfErr;
  if (!workflows?.length) return jsonRes({ executed: 0 });

  let executedCount = 0;
  let lastApprovalRef: string | null = null;

  for (const workflow of workflows) {
    const startTime = Date.now();
    const actionsExecuted: Array<{ type: string; result: string }> = [];
    let status = "success";
    let errorMessage: string | null = null;
    let approvalPayload: Record<string, unknown> | null = null;

    try {
      for (const action of (workflow.actions || []) as ActionPayload[]) {
        const result = await executeAction(supabase, action, trigger_data, workspace_id);
        actionsExecuted.push({ type: action.type, result });
      }
    } catch (e: unknown) {
      const err = e as CustomApprovalError;
      if (err?.status === "pending_review") {
        status = "pending_review";
        errorMessage = err.message;
        approvalPayload = err.approval_payload ?? null;
        lastApprovalRef = err.approval_reference ?? null;
      } else if (err?.status === "blocked") {
        status = "blocked";
        errorMessage = err.message;
      } else {
        status = "error";
        errorMessage = err instanceof Error ? err.message : "Unknown error";
      }
    }

    await supabase.from("automation_logs").insert({
      workflow_id: workflow.id,
      user_id: userId ?? workflow.user_id,
      trigger_event: trigger_type,
      actions_executed: actionsExecuted,
      status,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
      metadata: { trigger_data, approval_payload: approvalPayload },
    });

    if (status === "success") {
      await supabase
        .from("automation_workflows")
        .update({ execution_count: (workflow.execution_count || 0) + 1, last_executed_at: new Date().toISOString() })
        .eq("id", workflow.id)
        .eq("workspace_id", workspace_id);
      executedCount++;
    }
  }

  return jsonRes({
    executed: executedCount,
    approval_reference: lastApprovalRef,
    requires_human_approval: Boolean(lastApprovalRef),
  });
}

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  action: ActionPayload,
  triggerData: TriggerData,
  workspaceId: string
): Promise<string> {
  // ── SERVER-SIDE AI GUARD ENFORCEMENT FOR ADS AUTOMATION ──────────────────
  if (action.type && String(action.type).startsWith("ads_")) {
    const provider = action.provider ?? triggerData?.provider ?? "meta_ads";
    const adAccountId = action.ad_account_id ?? triggerData?.ad_account_id ?? "unknown";
    const currentSpend = Number(triggerData?.current_spend ?? 0);
    const baselineSpend = Number(triggerData?.baseline_spend ?? 0);

    const evaluation = evaluateServerAdsRisk({
      workspace_id: workspaceId,
      provider,
      ad_account_id: adAccountId,
      current_spend: currentSpend,
      baseline_spend: baselineSpend,
      auth_anomaly: Boolean(triggerData?.auth_anomaly),
      token_anomaly: Boolean(triggerData?.token_anomaly),
    });

    if (evaluation.decision === "BLOCK_PULSE_AUTOMATION") {
      const err: CustomApprovalError = new Error(`Blocked by AI Guard: ${evaluation.reasons.join(" ")}`);
      err.status = "blocked";
      throw err;
    }

    if (evaluation.decision === "REQUIRE_HUMAN_APPROVAL") {
      const approvalRef = `appr-${workspaceId}-${Date.now()}`;
      const approvalPayload = {
        approval_reference: approvalRef,
        workspace_id: workspaceId,
        provider,
        ad_account_id: adAccountId,
        campaign_id: action.campaign_id ?? triggerData?.campaign_id,
        risk_score: evaluation.risk_score,
        risk_level: evaluation.risk_level,
        triggered_rules: evaluation.triggered_rules,
        reasons: evaluation.reasons,
        proposed_action: action.type,
        status: "pending_review",
        created_at: evaluation.evaluated_at,
      };

      const err: CustomApprovalError = new Error(`Paused by AI Guard: Human Approval Required (${approvalRef})`);
      err.status = "pending_review";
      err.approval_reference = approvalRef;
      err.approval_payload = approvalPayload;
      throw err;
    }
  }

  switch (action.type) {
    case "notify_internal": {
      return `Notification sent to workspace ${workspaceId}`;
    }
    case "ads_optimize": {
      return `Ads optimization evaluated and allowed by AI Guard for workspace ${workspaceId}`;
    }
    case "discord_send_message": {
      // ── REAL SERVER-SIDE DISCORD DISPATCH ──────────────────────────
      const { data: channel } = await supabase
        .from("channels")
        .select("credentials_encrypted, provider_metadata")
        .eq("workspace_id", workspaceId)
        .eq("channel_type", "discord")
        .eq("connection_status", "connected")
        .maybeSingle();

      if (!channel) {
        throw new Error(`Discord integration not connected for workspace ${workspaceId}`);
      }

      let decryptedCreds: Record<string, string> = {};
      if (channel.credentials_encrypted) {
        try {
          const rawCreds = await decryptIfNeeded(channel.credentials_encrypted);
          if (typeof rawCreds === "string" && rawCreds.startsWith("{")) {
            decryptedCreds = JSON.parse(rawCreds);
          } else if (typeof rawCreds === "string") {
            decryptedCreds = { bot_token: rawCreds };
          }
        } catch {
          /* invalid format */
        }
      }

      const metadata = channel.provider_metadata || {};
      const botToken = decryptedCreds.bot_token ?? metadata.bot_token ?? null;
      const webhookUrl = decryptedCreds.webhook_url ?? metadata.webhook_url ?? null;
      const targetChannelId = action.channel_id ?? triggerData?.channel_id ?? metadata.channel_id ?? null;
      const messageContent = action.message_content ?? triggerData?.message_content ?? "Automated message from Pulse AI";

      if (botToken && targetChannelId) {
        const url = `https://discord.com/api/v10/channels/${targetChannelId}/messages`;
        const payload: Record<string, unknown> = { content: messageContent };
        if (action.reply_to_message_id) {
          payload.message_reference = { message_id: action.reply_to_message_id };
        }

        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
            "User-Agent": "PulseAI (https://pulse.ai, v1.0)",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Discord Bot API dispatch failed (${res.status}): ${errText}`);
        }

        const resData = await res.json();
        return `Discord Bot message sent successfully (message_id: ${resData.id})`;
      } else if (webhookUrl) {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messageContent, username: metadata.username ?? "Pulse AI" }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Discord Webhook dispatch failed (${res.status}): ${errText}`);
        }

        return `Discord Webhook message sent successfully`;
      }

      throw new Error(`No valid Discord connection credentials found for workspace ${workspaceId}`);
    }
    default:
      return `Executed action ${action.type} for workspace ${workspaceId}`;
  }
}
