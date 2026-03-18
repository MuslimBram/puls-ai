import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const WORKER_ID = crypto.randomUUID().slice(0, 8);
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

type JobOutcome =
  | { status: "completed" }
  | { status: "deferred"; nextRetryAt: string; message?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();

    await supabase
      .from("job_queue")
      .update({ status: "retry", locked_by: null, locked_at: null, error_message: "Recovered stale lock" })
      .eq("status", "processing")
      .lt("locked_at", staleThreshold);

    const { data: jobs, error: fetchError } = await supabase
      .from("job_queue")
      .select("*")
      .in("status", ["pending", "retry"])
      .lte("scheduled_for", nowIso)
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;
    if (!jobs?.length) {
      return new Response(JSON.stringify({ processed: 0, deferred: 0, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;
    let deferred = 0;

    for (const job of jobs) {
      const { data: lockedJob, error: lockError } = await supabase
        .from("job_queue")
        .update({
          status: "processing",
          locked_by: WORKER_ID,
          locked_at: new Date().toISOString(),
          started_at: job.started_at ?? new Date().toISOString(),
          error_message: null,
        })
        .eq("id", job.id)
        .in("status", ["pending", "retry"])
        .select("*")
        .maybeSingle();

      if (lockError || !lockedJob) continue;

      try {
        const outcome = await processJob(supabase, lockedJob);

        if (outcome.status === "deferred") {
          await supabase
            .from("job_queue")
            .update({
              status: "retry",
              next_retry_at: outcome.nextRetryAt,
              locked_by: null,
              locked_at: null,
              error_message: outcome.message ?? null,
            })
            .eq("id", lockedJob.id);
          deferred += 1;
          continue;
        }

        await supabase
          .from("job_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            next_retry_at: null,
            locked_by: null,
            locked_at: null,
            error_message: null,
          })
          .eq("id", lockedJob.id);

        processed += 1;
      } catch (error) {
        const attempts = (lockedJob.attempts ?? 0) + 1;
        const maxAttempts = lockedJob.max_attempts ?? 5;
        const errorMessage = error instanceof Error ? error.message : "Unknown worker error";

        if (attempts >= maxAttempts) {
          await supabase
            .from("job_queue")
            .update({
              status: "failed",
              attempts,
              error_message: errorMessage,
              completed_at: new Date().toISOString(),
              next_retry_at: null,
              locked_by: null,
              locked_at: null,
            })
            .eq("id", lockedJob.id);

          if (lockedJob.job_type === "media_generation") {
            await finalizeMediaGenerationFailure(supabase, lockedJob, errorMessage, attempts);
          }
        } else {
          const backoffMs = Math.min(30000 * Math.pow(2, attempts - 1), 10 * 60 * 1000);
          await supabase
            .from("job_queue")
            .update({
              status: "retry",
              attempts,
              error_message: errorMessage,
              next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
              locked_by: null,
              locked_at: null,
            })
            .eq("id", lockedJob.id);
        }

        failed += 1;
      }
    }

    return new Response(JSON.stringify({ processed, deferred, failed, worker: WORKER_ID }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processJob(supabase: any, job: any): Promise<JobOutcome> {
  const payload = job.job_payload ?? {};

  switch (job.job_type) {
    case "media_generation":
      return await processMediaGenerationJob(supabase, job, payload);

    case "archive_messages": {
      await supabase.rpc("archive_old_messages", {
        _workspace_id: payload.workspace_id,
        _days_old: payload.days_old ?? 90,
      });
      return { status: "completed" };
    }

    case "compute_storage_quota": {
      const { count: messageCount } = await supabase
        .from("inbox_messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", payload.user_id);

      await supabase.from("workspace_storage_quotas").upsert(
        {
          workspace_id: payload.workspace_id,
          messages_count: messageCount ?? 0,
          last_computed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" },
      );
      return { status: "completed" };
    }

    case "subscription_reconcile": {
      await supabase.from("subscription_state_cache").upsert(
        {
          workspace_id: payload.workspace_id,
          user_id: payload.user_id,
          plan_name: payload.plan_name,
          status: payload.status,
          stripe_subscription_id: payload.stripe_subscription_id,
          current_period_end: payload.current_period_end,
          last_webhook_at: new Date().toISOString(),
          cached_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" },
      );
      return { status: "completed" };
    }

    case "health_check": {
      const startedAt = Date.now();
      let status = "healthy";
      let errorMessage: string | null = null;

      try {
        const response = await fetch(payload.target_url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          status = "degraded";
          errorMessage = `HTTP ${response.status}`;
        }
      } catch (error) {
        status = "down";
        errorMessage = error instanceof Error ? error.message : "Unknown health check error";
      }

      await supabase.from("system_health_checks").insert({
        check_type: payload.check_type,
        target_name: payload.target_name,
        status,
        response_time_ms: Date.now() - startedAt,
        error_message: errorMessage,
        workspace_id: payload.workspace_id,
      });
      return { status: "completed" };
    }

    case "downgrade_expired_grace": {
      const { data: expired } = await supabase
        .from("subscription_state_cache")
        .select("*")
        .eq("status", "past_due")
        .lt("grace_period_end", new Date().toISOString());

      for (const subscription of expired ?? []) {
        await supabase
          .from("subscriptions")
          .update({ plan: "free", updated_at: new Date().toISOString() })
          .eq("workspace_id", subscription.workspace_id);

        await supabase
          .from("subscription_state_cache")
          .update({ plan_name: "free", status: "downgraded", updated_at: new Date().toISOString() })
          .eq("workspace_id", subscription.workspace_id);

        await supabase.from("business_notifications").insert({
          user_id: subscription.user_id,
          title: "Subscription downgraded",
          message: "Your subscription was downgraded after the grace period expired.",
          notification_type: "warning",
          category: "billing",
        });
      }

      return { status: "completed" };
    }

    default:
      throw new Error(`Unknown job type: ${job.job_type}`);
  }
}

async function processMediaGenerationJob(supabase: any, job: any, payload: Record<string, unknown>): Promise<JobOutcome> {
  const generationId = String(payload.generation_id ?? "");
  if (!generationId) throw new Error("Missing generation_id in media job payload");

  const { data: generation, error: generationError } = await supabase
    .from("media_generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();

  if (generationError) throw generationError;
  if (!generation) throw new Error(`Media generation ${generationId} not found`);
  if (["completed", "failed"].includes(generation.status)) return { status: "completed" };

  const providerKey = String(payload.provider_key ?? generation.provider_key ?? "");
  const { data: provider, error: providerError } = await supabase
    .from("media_provider_settings")
    .select("*")
    .eq("provider_key", providerKey)
    .maybeSingle();

  if (providerError) throw providerError;
  if (!provider) throw new Error(`Provider ${providerKey} not found`);

  const nowIso = new Date().toISOString();
  if (generation.status === "queued" || generation.status === "pending") {
    await supabase
      .from("media_generations")
      .update({ status: "generating", started_at: generation.started_at ?? nowIso, updated_at: nowIso })
      .eq("id", generation.id);
  }

  await supabase.from("media_usage_events").insert({
    generation_id: generation.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    media_type: generation.media_type,
    event_type: "processing",
    status: "generating",
    provider_key: provider.provider_key,
    metadata: { worker_id: WORKER_ID },
  });

  if (generation.media_type === "video") {
    if (provider.is_mock) {
      return await processMockVideoGeneration(supabase, generation, provider);
    }

    throw new Error(`No registered runtime handler for video provider ${provider.provider_key}`);
  }

  if (generation.media_type === "image") {
    if (provider.provider_key === "lovable-image") {
      await processLovableImageGeneration(supabase, generation, provider);
      return { status: "completed" };
    }

    throw new Error(`No registered runtime handler for image provider ${provider.provider_key}`);
  }

  throw new Error(`Unsupported media type ${generation.media_type}`);
}

async function processMockVideoGeneration(supabase: any, generation: any, provider: any): Promise<JobOutcome> {
  const metadata = toRecord(generation.metadata);
  const providerConfig = toRecord(provider.config);
  const minDelayMs = Number(providerConfig.minDelayMs ?? 8000);
  const maxDelayMs = Number(providerConfig.maxDelayMs ?? 18000);
  const delayMs = randomInt(minDelayMs, maxDelayMs);

  if (!generation.provider_job_id || !metadata.ready_at) {
    const readyAt = new Date(Date.now() + delayMs).toISOString();
    const providerJobId = generation.provider_job_id ?? `mock_${crypto.randomUUID()}`;

    await supabase
      .from("media_generations")
      .update({
        provider_job_id: providerJobId,
        status: "generating",
        updated_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          ready_at: readyAt,
          delay_ms: delayMs,
          mock: true,
          output_kind: "mock_video_poster",
        },
      })
      .eq("id", generation.id);

    return { status: "deferred", nextRetryAt: readyAt, message: "Mock video render in progress" };
  }

  if (new Date(metadata.ready_at as string).getTime() > Date.now()) {
    return { status: "deferred", nextRetryAt: String(metadata.ready_at), message: "Mock video still rendering" };
  }

  const posterSvg = createMockVideoPoster({
    prompt: generation.prompt ?? "Mock video",
    durationSeconds: generation.duration_seconds ?? 10,
    providerName: provider.provider_name,
  });

  const filePath = `${generation.user_id}/${generation.id}-mock-video.svg`;
  const bytes = new TextEncoder().encode(posterSvg);

  const { error: uploadError } = await supabase.storage
    .from("generated-media")
    .upload(filePath, bytes, { contentType: "image/svg+xml", upsert: true });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("generated-media").getPublicUrl(filePath);

  await finalizeMediaGenerationSuccess(supabase, generation, {
    providerKey: provider.provider_key,
    resultUrl: publicUrlData.publicUrl,
    providerJobId: generation.provider_job_id,
    metadata: {
      ...metadata,
      mock: true,
      output_kind: "mock_video_poster",
      completed_by: WORKER_ID,
    },
  });

  return { status: "completed" };
}

async function processLovableImageGeneration(supabase: any, generation: any, provider: any) {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const providerConfig = toRecord(provider.config);
  const model = String(providerConfig.model ?? DEFAULT_IMAGE_MODEL);

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: `Generate an image based on this description: ${generation.prompt}` }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Lovable image provider failed [${response.status}]: ${body}`);
  }

  const data = await response.json();
  const imageData = extractImageData(data);
  if (!imageData.base64) throw new Error("Image provider did not return image data");

  const extension = imageData.mimeType === "image/jpeg" ? "jpg" : "png";
  const filePath = `${generation.user_id}/${generation.id}.${extension}`;
  const bytes = Uint8Array.from(atob(imageData.base64), (character) => character.charCodeAt(0));

  const { error: uploadError } = await supabase.storage
    .from("generated-media")
    .upload(filePath, bytes, { contentType: imageData.mimeType, upsert: true });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("generated-media").getPublicUrl(filePath);

  await finalizeMediaGenerationSuccess(supabase, generation, {
    providerKey: provider.provider_key,
    resultUrl: publicUrlData.publicUrl,
    providerJobId: generation.provider_job_id,
    metadata: {
      ...toRecord(generation.metadata),
      completed_by: WORKER_ID,
      model,
      output_kind: "image",
    },
  });
}

async function finalizeMediaGenerationSuccess(
  supabase: any,
  generation: any,
  payload: { providerKey: string; resultUrl: string; providerJobId?: string | null; metadata: Record<string, unknown> },
) {
  await supabase
    .from("media_generations")
    .update({
      status: "completed",
      result_url: payload.resultUrl,
      provider_job_id: payload.providerJobId ?? generation.provider_job_id,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
      metadata: payload.metadata,
    })
    .eq("id", generation.id);

  await supabase.from("media_usage_events").insert({
    generation_id: generation.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    media_type: generation.media_type,
    event_type: "completed",
    status: "completed",
    provider_key: payload.providerKey,
    metadata: {
      result_url: payload.resultUrl,
    },
  });

  const field = generation.media_type === "video" ? "videos_generated_this_month" : "images_generated_this_month";
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select(field)
    .eq("user_id", generation.user_id)
    .maybeSingle();

  const nextValue = Number(subscription?.[field] ?? 0) + 1;
  await supabase.from("subscriptions").update({ [field]: nextValue }).eq("user_id", generation.user_id);
}

async function finalizeMediaGenerationFailure(supabase: any, job: any, errorMessage: string, attempts: number) {
  const generationId = job.job_payload?.generation_id;
  if (!generationId) return;

  const { data: generation } = await supabase
    .from("media_generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();

  if (!generation || generation.status === "failed") return;

  await supabase
    .from("media_generations")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        ...toRecord(generation.metadata),
        failed_at: new Date().toISOString(),
        failed_by: WORKER_ID,
        attempts,
      },
    })
    .eq("id", generation.id);

  await supabase.from("media_generation_errors").insert({
    generation_id: generation.id,
    job_id: job.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    provider_key: generation.provider_key,
    media_type: generation.media_type,
    error_stage: "processing",
    error_message: errorMessage,
    error_details: { attempts },
  });

  await supabase.from("media_usage_events").insert({
    generation_id: generation.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    media_type: generation.media_type,
    event_type: "failed",
    status: "failed",
    provider_key: generation.provider_key,
    metadata: { attempts, error: errorMessage },
  });

  if (generation.media_type === "image") {
    await supabase
      .from("media_usage_daily")
      .update({ image_count: Math.max(0, Number((await getDailyUsage(supabase, generation.user_id))?.image_count ?? 1) - 1) })
      .eq("user_id", generation.user_id);
  } else if (generation.media_type === "video") {
    await supabase
      .from("media_usage_daily")
      .update({ video_count: Math.max(0, Number((await getDailyUsage(supabase, generation.user_id))?.video_count ?? 1) - 1) })
      .eq("user_id", generation.user_id);
  }

  await supabase.from("media_usage_events").insert({
    generation_id: generation.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    media_type: generation.media_type,
    event_type: "refund",
    status: "refunded",
    provider_key: generation.provider_key,
    metadata: { reason: "provider_failure" },
  });
}

async function getDailyUsage(supabase: any, userId: string) {
  const { data } = await supabase
    .from("media_usage_daily")
    .select("image_count, video_count")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

function extractImageData(response: any) {
  let base64: string | null = null;
  let mimeType = "image/png";
  const choice = response.choices?.[0];
  const content = choice?.message?.content;

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === "image_url" && part.image_url?.url) {
        const match = String(part.image_url.url).match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64 = match[2];
          break;
        }
      }
      if (part?.inline_data?.data) {
        mimeType = part.inline_data.mime_type || "image/png";
        base64 = part.inline_data.data;
        break;
      }
    }
  }

  if (!base64 && typeof content === "string") {
    const match = content.match(/data:(image\/[^;]+);base64,([A-Za-z0-9+/=]+)/);
    if (match) {
      mimeType = match[1];
      base64 = match[2];
    }
  }

  return { base64, mimeType };
}

function createMockVideoPoster({ prompt, durationSeconds, providerName }: { prompt: string; durationSeconds: number; providerName: string }) {
  const safePrompt = escapeXml(prompt.slice(0, 180));
  const safeProvider = escapeXml(providerName);

  return `
    <svg width="1200" height="675" viewBox="0 0 1200 675" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="675" rx="28" fill="hsl(220 24% 10%)"/>
      <rect x="24" y="24" width="1152" height="627" rx="24" fill="hsl(220 18% 16%)" stroke="hsl(220 14% 28%)"/>
      <circle cx="600" cy="320" r="86" fill="hsl(0 0% 100% / 0.08)"/>
      <path d="M565 265L670 320L565 375V265Z" fill="hsl(0 0% 100%)"/>
      <text x="72" y="104" fill="hsl(0 0% 100%)" font-size="42" font-family="Arial, sans-serif" font-weight="700">Mock Video Output</text>
      <text x="72" y="148" fill="hsl(220 10% 78%)" font-size="22" font-family="Arial, sans-serif">Production queue simulated by provider abstraction</text>
      <text x="72" y="508" fill="hsl(0 0% 100%)" font-size="28" font-family="Arial, sans-serif" font-weight="600">${safePrompt}</text>
      <text x="72" y="560" fill="hsl(220 10% 78%)" font-size="20" font-family="Arial, sans-serif">Provider: ${safeProvider} · Duration: ${durationSeconds}s</text>
      <text x="72" y="602" fill="hsl(220 10% 68%)" font-size="18" font-family="Arial, sans-serif">Swap this provider with any real video API later without rebuilding the app layer.</text>
    </svg>
  `;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function randomInt(min: number, max: number) {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}
