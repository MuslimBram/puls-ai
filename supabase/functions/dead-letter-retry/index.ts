import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const now = new Date();

    // 1. Find retryable items: pending, next_retry_at <= now, under max_retries
    const { data: retryable, error: fetchErr } = await supabase
      .from("dead_letter_queue")
      .select("*")
      .eq("status", "pending")
      .lte("next_retry_at", now.toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(20);

    if (fetchErr) throw fetchErr;

    let retried = 0;
    let escalated = 0;
    let failed = 0;

    for (const item of retryable || []) {
      const retryCount = (item.retry_count || 0) + 1;
      const maxRetries = item.max_retries || 5;

      if (retryCount > maxRetries) {
        // Escalate: max retries exceeded
        await supabase.from("dead_letter_queue").update({
          status: "escalated",
          escalated: true,
          escalated_at: now.toISOString(),
          last_retry_at: now.toISOString(),
        }).eq("id", item.id);

        // Create notification for admin
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(5);

        for (const admin of admins || []) {
          await supabase.from("business_notifications").insert({
            user_id: admin.user_id,
            title: "Dead Letter Escalation",
            message: `Job ${item.job_type} (${item.id}) exceeded ${maxRetries} retries and has been escalated.`,
            notification_type: "system",
            category: "alert",
          });
        }

        escalated++;
        continue;
      }

      // Exponential backoff: 2^retry * 30 seconds (30s, 60s, 120s, 240s, 480s)
      const backoffMs = Math.pow(2, retryCount) * 30_000;
      const nextRetryAt = new Date(now.getTime() + backoffMs);

      try {
        // Re-enqueue to job_queue
        const { error: enqueueErr } = await supabase.from("job_queue").insert({
          job_type: item.job_type,
          job_payload: item.payload || {},
          status: "pending",
          scheduled_for: now.toISOString(),
        });

        if (enqueueErr) throw enqueueErr;

        // Update DLQ entry
        await supabase.from("dead_letter_queue").update({
          retry_count: retryCount,
          last_retry_at: now.toISOString(),
          next_retry_at: nextRetryAt.toISOString(),
          status: "retrying",
        }).eq("id", item.id);

        retried++;
      } catch (retryErr) {
        const errMsg = retryErr instanceof Error ? retryErr.message : "Unknown retry error";
        await supabase.from("dead_letter_queue").update({
          retry_count: retryCount,
          last_retry_at: now.toISOString(),
          next_retry_at: nextRetryAt.toISOString(),
          error_message: errMsg,
        }).eq("id", item.id);
        failed++;
      }
    }

    // 2. Check retrying items: if job completed, mark DLQ as resolved
    const { data: retrying } = await supabase
      .from("dead_letter_queue")
      .select("id, payload")
      .eq("status", "retrying")
      .limit(50);

    let resolved = 0;
    for (const item of retrying || []) {
      // Check if corresponding job completed
      const { data: completedJob } = await supabase
        .from("job_queue")
        .select("id")
        .eq("job_type", (item as any).job_type)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (completedJob) {
        await supabase.from("dead_letter_queue").update({
          status: "resolved",
          resolved_at: now.toISOString(),
        }).eq("id", item.id);
        resolved++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      retried,
      escalated,
      failed,
      resolved,
      pending: (retryable || []).length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[DEAD-LETTER-RETRY] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
