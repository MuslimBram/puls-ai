import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget invocation of the execute-automation edge function.
 * Every call results in one or more automation_logs rows (one per matching active workflow).
 * Failures are swallowed (logged to console) so caller flows are never blocked.
 */
export async function triggerAutomation(params: {
  trigger_type: string;
  user_id: string;
  workspace_id?: string | null;
  trigger_data?: Record<string, unknown>;
}): Promise<{ executed: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("execute-automation", {
      body: {
        trigger_type: params.trigger_type,
        user_id: params.user_id,
        workspace_id: params.workspace_id ?? null,
        trigger_data: params.trigger_data ?? {},
      },
    });
    if (error) {
      console.warn("[triggerAutomation] invoke error:", error.message);
      return null;
    }
    return data as { executed: number };
  } catch (e) {
    console.warn("[triggerAutomation] exception:", e);
    return null;
  }
}
