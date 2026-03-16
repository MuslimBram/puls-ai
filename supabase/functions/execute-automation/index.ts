import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { trigger_type, trigger_data, user_id, workspace_id } = await req.json();

    if (!trigger_type || !user_id) {
      return new Response(JSON.stringify({ error: "trigger_type and user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find matching active workflows
    const { data: workflows, error: wfErr } = await supabase
      .from("automation_workflows")
      .select("*")
      .eq("user_id", user_id)
      .eq("trigger_type", trigger_type)
      .eq("is_active", true);

    if (wfErr) throw wfErr;
    if (!workflows?.length) {
      return new Response(JSON.stringify({ executed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let executedCount = 0;

    for (const workflow of workflows) {
      const startTime = Date.now();
      const actionsExecuted: any[] = [];
      let status = "success";
      let errorMessage: string | null = null;

      try {
        const actions = workflow.actions || [];
        for (const action of actions) {
          const result = await executeAction(supabase, action, trigger_data, user_id, workspace_id);
          actionsExecuted.push({ type: action.type, result });
        }
      } catch (e) {
        status = "error";
        errorMessage = e instanceof Error ? e.message : "Unknown error";
      }

      const durationMs = Date.now() - startTime;

      // Log execution
      await supabase.from("automation_logs").insert({
        workflow_id: workflow.id,
        user_id,
        trigger_event: trigger_type,
        actions_executed: actionsExecuted,
        status,
        error_message: errorMessage,
        duration_ms: durationMs,
        metadata: { trigger_data },
      });

      // Update workflow stats
      await supabase
        .from("automation_workflows")
        .update({
          execution_count: (workflow.execution_count || 0) + 1,
          last_executed_at: new Date().toISOString(),
        })
        .eq("id", workflow.id);

      executedCount++;
    }

    return new Response(JSON.stringify({ executed: executedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("execute-automation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function executeAction(
  supabase: any,
  action: any,
  triggerData: any,
  userId: string,
  workspaceId?: string,
): Promise<string> {
  switch (action.type) {
    case "notify_internal": {
      // Create an inbox message as internal notification
      await supabase.from("inbox_messages").insert({
        user_id: userId,
        channel_type: "system",
        source_name: "Automation",
        sender_name: "System",
        message_content: `Automation triggered: ${action.config?.message || "New event"}`,
        message_timestamp: new Date().toISOString(),
        is_unread: true,
        priority: "normal",
        status: "new",
      });
      return "notification_sent";
    }

    case "create_task": {
      if (triggerData?.deal_id) {
        await supabase.from("deal_tasks").insert({
          deal_id: triggerData.deal_id,
          user_id: userId,
          title: action.config?.title || "Follow-up task",
          priority: action.config?.priority || "medium",
        });
      }
      return "task_created";
    }

    case "move_pipeline": {
      if (triggerData?.deal_id && action.config?.stage_id) {
        await supabase
          .from("deals")
          .update({ stage_id: action.config.stage_id, updated_at: new Date().toISOString() })
          .eq("id", triggerData.deal_id);
      }
      return "pipeline_moved";
    }

    case "assign_owner": {
      if (triggerData?.deal_id && action.config?.assigned_to) {
        await supabase
          .from("deals")
          .update({ assigned_to: action.config.assigned_to, updated_at: new Date().toISOString() })
          .eq("id", triggerData.deal_id);
      }
      return "owner_assigned";
    }

    case "update_tags": {
      if (triggerData?.deal_id && action.config?.tags) {
        const { data: deal } = await supabase
          .from("deals")
          .select("tags")
          .eq("id", triggerData.deal_id)
          .single();
        const existingTags = deal?.tags || [];
        const newTags = [...new Set([...existingTags, ...action.config.tags])];
        await supabase
          .from("deals")
          .update({ tags: newTags, updated_at: new Date().toISOString() })
          .eq("id", triggerData.deal_id);
      }
      return "tags_updated";
    }

    case "call_webhook": {
      if (action.config?.url) {
        const resp = await fetch(action.config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger_data: triggerData, user_id: userId }),
        });
        return `webhook_${resp.status}`;
      }
      return "no_url_configured";
    }

    default:
      return `unknown_action_${action.type}`;
  }
}
