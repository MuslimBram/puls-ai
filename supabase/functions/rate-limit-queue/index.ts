import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter (per function instance)
const rateLimits = new Map<string, { count: number; windowStart: number }>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  default: 60,
  webhook: 200,
  public: 30,
};

function checkRateLimit(key: string, category: string = "default"): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const limit = RATE_LIMITS[category] || RATE_LIMITS.default;
  const entry = rateLimits.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

// Background job processor
async function processJobQueue(supabase: any) {
  const { data: jobs } = await supabase
    .from("job_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(10);

  if (!jobs || jobs.length === 0) return { processed: 0 };

  let processed = 0;
  for (const job of jobs) {
    try {
      await supabase.from("job_queue").update({
        status: "processing",
        started_at: new Date().toISOString(),
        attempts: (job.attempts || 0) + 1,
      }).eq("id", job.id);

      // Process based on job type
      switch (job.job_type) {
        case "webhook_forward":
          // Forward webhook to target
          console.log(`[JOB] Processing webhook forward: ${job.id}`);
          break;
        case "email_poll":
          console.log(`[JOB] Processing email poll: ${job.id}`);
          break;
        case "commission_approve":
          console.log(`[JOB] Processing commission approval: ${job.id}`);
          break;
        default:
          console.log(`[JOB] Unknown job type: ${job.job_type}`);
      }

      await supabase.from("job_queue").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", job.id);

      processed++;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = job.max_attempts || 3;

      await supabase.from("job_queue").update({
        status: attempts >= maxAttempts ? "failed" : "pending",
        error_message: errMsg,
      }).eq("id", job.id);
    }
  }

  return { processed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const { action, rateLimitKey, category } = await req.json();

    // Rate limit check
    if (action === "check_rate_limit") {
      if (!rateLimitKey) throw new Error("rateLimitKey required");
      const result = checkRateLimit(rateLimitKey, category || "default");
      
      if (!result.allowed) {
        return new Response(JSON.stringify({
          allowed: false,
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: 60,
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }

      return new Response(JSON.stringify({ allowed: true, remaining: result.remaining }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process job queue
    if (action === "process_jobs") {
      const result = await processJobQueue(supabase);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enqueue a job
    if (action === "enqueue") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No authorization header");
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      if (!userData.user) throw new Error("Not authenticated");

      const { jobType, payload, scheduledFor, workspaceId } = await req.json();
      
      const { error } = await supabase.from("job_queue").insert({
        user_id: userData.user.id,
        job_type: jobType,
        job_payload: payload || {},
        scheduled_for: scheduledFor || new Date().toISOString(),
        workspace_id: workspaceId || null,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ queued: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("rate-limit-queue error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
