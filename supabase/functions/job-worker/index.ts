import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 min stale lock
const WORKER_ID = crypto.randomUUID().slice(0, 8);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Release stale locks
    const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
    await supabase
      .from("job_queue")
      .update({ status: "retry", locked_by: null, locked_at: null, updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("locked_at", staleThreshold);

    // 2. Fetch pending/retry jobs
    const { data: jobs, error: fetchErr } = await supabase
      .from("job_queue")
      .select("*")
      .in("status", ["pending", "retry"])
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;
    if (!jobs?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
      // Lock the job
      const { error: lockErr } = await supabase
        .from("job_queue")
        .update({
          status: "processing",
          locked_by: WORKER_ID,
          locked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .in("status", ["pending", "retry"]);

      if (lockErr) continue;

      try {
        // Route job by type
        await processJob(supabase, job);

        // Mark completed
        await supabase
          .from("job_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            locked_by: null,
            locked_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        processed++;
      } catch (err) {
        const attempt = (job.attempt_count ?? 0) + 1;
        const maxAttempts = job.max_attempts ?? 5;

        if (attempt >= maxAttempts) {
          // Move to failed
          await supabase
            .from("job_queue")
            .update({
              status: "failed",
              attempt_count: attempt,
              last_error: err.message,
              locked_by: null,
              locked_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        } else {
          // Exponential backoff: 30s, 60s, 120s, 240s...
          const backoffMs = Math.min(30000 * Math.pow(2, attempt - 1), 600000);
          const nextRetry = new Date(Date.now() + backoffMs).toISOString();

          await supabase
            .from("job_queue")
            .update({
              status: "retry",
              attempt_count: attempt,
              last_error: err.message,
              next_retry_at: nextRetry,
              locked_by: null,
              locked_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, failed, worker: WORKER_ID }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processJob(supabase: any, job: any) {
  const { job_type, payload } = job;

  switch (job_type) {
    case "archive_messages": {
      const { data } = await supabase.rpc("archive_old_messages", {
        _workspace_id: payload.workspace_id,
        _days_old: payload.days_old ?? 90,
      });
      return data;
    }

    case "compute_storage_quota": {
      const wsId = payload.workspace_id;
      const { count: msgCount } = await supabase
        .from("inbox_messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", payload.user_id);

      await supabase.from("workspace_storage_quotas").upsert({
        workspace_id: wsId,
        messages_count: msgCount ?? 0,
        last_computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" });
      return;
    }

    case "subscription_reconcile": {
      // Sync subscription cache from Stripe webhook data
      const { workspace_id, plan_name, status, stripe_subscription_id, current_period_end } = payload;
      await supabase.from("subscription_state_cache").upsert({
        workspace_id,
        user_id: payload.user_id,
        plan_name,
        status,
        stripe_subscription_id,
        current_period_end,
        last_webhook_at: new Date().toISOString(),
        cached_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" });
      return;
    }

    case "health_check": {
      const { check_type, target_name, target_url, workspace_id } = payload;
      const start = Date.now();
      let status = "healthy";
      let errorMsg = null;

      try {
        const res = await fetch(target_url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
        if (!res.ok) { status = "degraded"; errorMsg = `HTTP ${res.status}`; }
      } catch (e) {
        status = "down";
        errorMsg = e.message;
      }

      await supabase.from("system_health_checks").insert({
        check_type,
        target_name,
        status,
        response_time_ms: Date.now() - start,
        error_message: errorMsg,
        workspace_id,
      });
      return;
    }

    case "downgrade_expired_grace": {
      // Find subscriptions past grace period
      const { data: expired } = await supabase
        .from("subscription_state_cache")
        .select("*")
        .eq("status", "past_due")
        .lt("grace_period_end", new Date().toISOString());

      for (const sub of expired ?? []) {
        await supabase
          .from("subscriptions")
          .update({ plan: "free", updated_at: new Date().toISOString() })
          .eq("workspace_id", sub.workspace_id);

        await supabase
          .from("subscription_state_cache")
          .update({ plan_name: "free", status: "downgraded", updated_at: new Date().toISOString() })
          .eq("workspace_id", sub.workspace_id);

        await supabase.from("business_notifications").insert({
          user_id: sub.user_id,
          title: "Subscription Downgraded",
          message: "Your subscription has been downgraded to Free due to unpaid invoices. Please update your payment method.",
          notification_type: "warning",
          category: "billing",
        });
      }
      return;
    }

    default:
      throw new Error(`Unknown job type: ${job_type}`);
  }
}
