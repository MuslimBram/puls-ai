import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const IMAGE_QUEUE_STATUSES = ["media_pending", "media_retry"];
const BATCH_SIZE = 10;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const WORKER_ID = `image-${crypto.randomUUID().slice(0, 8)}`;
const REPLICATE_API_URL = "https://api.replicate.com/v1";
const REPLICATE_DEFAULT_IMAGE_MODEL = "black-forest-labs/flux-schnell";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type JobOutcome =
  | { status: "completed" }
  | { status: "deferred"; nextRetryAt: string; message?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const unauth = requireCronAuth(req);
  if (unauth) {
    return new Response(unauth.body, {
      status: unauth.status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = getServiceKey() ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (!supabaseUrl || !serviceKey || !cronSecret) {
    return json(req, { error: "Worker configuration incomplete" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let imageProcessed = 0;
  let imageDeferred = 0;
  let imageFailed = 0;

  try {
    const nowIso = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();

    // Recover only stale IMAGE locks. Image jobs are isolated from the core by
    // media_pending/media_retry statuses, so the legacy core cannot claim them.
    await supabase
      .from("job_queue")
      .update({
        status: "media_retry",
        locked_by: null,
        locked_at: null,
        error_message: "Recovered stale image lock",
        next_retry_at: nowIso,
      })
      .eq("job_type", "media_generation")
      .eq("status", "processing")
      .contains("job_payload", { media_type: "image" })
      .lt("locked_at", staleThreshold);

    const { data: jobs, error: fetchError } = await supabase
      .from("job_queue")
      .select("*")
      .eq("job_type", "media_generation")
      .contains("job_payload", { media_type: "image" })
      .in("status", IMAGE_QUEUE_STATUSES)
      .lte("scheduled_for", nowIso)
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    for (const job of jobs ?? []) {
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
        .eq("job_type", "media_generation")
        .contains("job_payload", { media_type: "image" })
        .in("status", IMAGE_QUEUE_STATUSES)
        .select("*")
        .maybeSingle();

      if (lockError || !lockedJob) continue;

      try {
        const outcome = await processImageGenerationJob(supabase, lockedJob);
        if (outcome.status === "deferred") {
          await supabase
            .from("job_queue")
            .update({
              status: "media_retry",
              next_retry_at: outcome.nextRetryAt,
              locked_by: null,
              locked_at: null,
              error_message: outcome.message ?? null,
            })
            .eq("id", lockedJob.id);
          imageDeferred += 1;
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
        imageProcessed += 1;
      } catch (error) {
        const attempts = Number(lockedJob.attempts ?? 0) + 1;
        const maxAttempts = Number(lockedJob.max_attempts ?? 4);
        const errorMessage = error instanceof Error ? error.message : String(error);

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
          await finalizeImageFailure(supabase, lockedJob, errorMessage, attempts);
        } else {
          const backoffMs = Math.min(30_000 * Math.pow(2, attempts - 1), 10 * 60_000);
          await supabase
            .from("job_queue")
            .update({
              status: "media_retry",
              attempts,
              error_message: errorMessage,
              next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
              locked_by: null,
              locked_at: null,
            })
            .eq("id", lockedJob.id);
        }
        imageFailed += 1;
      }
    }

    // The core preserves all existing non-image behavior (AI-3, scans, video,
    // maintenance jobs). It only reads pending/retry, never media_* statuses.
    const coreResponse = await fetch(`${supabaseUrl}/functions/v1/job-worker-core`, {
      method: "POST",
      headers: {
        "x-cron-secret": cronSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source: "job-worker-orchestrator" }),
      signal: AbortSignal.timeout(55_000),
    });

    const coreText = await coreResponse.text();
    let core: unknown = coreText;
    try {
      core = coreText ? JSON.parse(coreText) : null;
    } catch {
      // Keep text body for diagnostics.
    }

    if (!coreResponse.ok) {
      return json(req, {
        error: "job-worker-core failed",
        image: { processed: imageProcessed, deferred: imageDeferred, failed: imageFailed },
        core,
      }, 502);
    }

    return json(req, {
      ok: true,
      image: { processed: imageProcessed, deferred: imageDeferred, failed: imageFailed, worker: WORKER_ID },
      core,
    });
  } catch (error) {
    return json(req, {
      error: error instanceof Error ? error.message : String(error),
      image: { processed: imageProcessed, deferred: imageDeferred, failed: imageFailed },
    }, 500);
  }
});

async function processImageGenerationJob(supabase: any, job: any): Promise<JobOutcome> {
  const payload = toRecord(job.job_payload);
  const generationId = String(payload.generation_id ?? "");
  if (!generationId) throw new Error("Missing generation_id in image job payload");

  const { data: generation, error: generationError } = await supabase
    .from("media_generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();

  if (generationError) throw generationError;
  if (!generation) throw new Error(`Media generation ${generationId} not found`);
  if (generation.media_type !== "image") throw new Error("Dedicated image worker received a non-image generation");
  if (["completed", "failed"].includes(generation.status)) return { status: "completed" };

  const providerKey = String(payload.provider_key ?? generation.provider_key ?? "replicate-image");
  const { data: provider, error: providerError } = await supabase
    .from("media_provider_settings")
    .select("*")
    .eq("provider_key", providerKey)
    .eq("is_enabled", true)
    .maybeSingle();

  if (providerError) throw providerError;
  if (!provider) throw new Error(`Active image provider ${providerKey} not found`);

  const config = toRecord(provider.config);
  const adapter = String(config.adapter ?? provider.provider_key);
  if (adapter !== "replicate" && adapter !== "replicate-image") {
    throw new Error(`Unsupported active image adapter ${adapter}`);
  }

  if (["queued", "pending"].includes(generation.status)) {
    await supabase
      .from("media_generations")
      .update({
        status: "generating",
        started_at: generation.started_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider_key: provider.provider_key,
      })
      .eq("id", generation.id);
  }

  await supabase.from("media_usage_events").insert({
    generation_id: generation.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    media_type: "image",
    event_type: "processing",
    status: "generating",
    provider_key: provider.provider_key,
    metadata: { worker_id: WORKER_ID },
  });

  const token = await resolveProviderSecret(supabase, provider);
  if (!token) throw new Error(`No credential available for image provider ${provider.provider_key}`);

  const model = String(config.model ?? REPLICATE_DEFAULT_IMAGE_MODEL);
  const promptField = String(config.prompt_field ?? "prompt");
  const inputDefaults = toRecord(config.input_defaults);
  const predictionOptions = toRecord(config.prediction_options);
  const metadata = toRecord(generation.metadata);

  if (!generation.provider_job_id) {
    const input: Record<string, unknown> = { ...inputDefaults, [promptField]: generation.prompt };
    const response = await fetch(`${REPLICATE_API_URL}/models/${model}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...predictionOptions, input }),
      signal: AbortSignal.timeout(30_000),
    });

    const bodyText = await response.text();
    if (!response.ok) throw new Error(`Replicate image create failed [${response.status}]: ${bodyText}`);
    const created = safeJsonParse(bodyText);
    const providerJobId = String(created?.id ?? "");
    if (!providerJobId) throw new Error("Replicate did not return an image prediction id");

    await supabase
      .from("media_generations")
      .update({
        provider_key: provider.provider_key,
        provider_job_id: providerJobId,
        status: "generating",
        updated_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          adapter: "replicate-image",
          model,
          prediction_status: created?.status ?? "starting",
          input_payload: input,
        },
      })
      .eq("id", generation.id);

    if (created?.status === "succeeded") {
      const immediateUrl = extractReplicateOutputUrl(created?.output);
      if (immediateUrl) {
        const persistentUrl = await persistRemoteImage(supabase, generation, immediateUrl);
        await finalizeImageSuccess(supabase, generation, provider.provider_key, persistentUrl, providerJobId, {
          ...metadata,
          adapter: "replicate-image",
          model,
          prediction_status: "succeeded",
          completed_by: WORKER_ID,
          output_kind: "image",
        });
        return { status: "completed" };
      }
    }

    return {
      status: "deferred",
      nextRetryAt: new Date(Date.now() + 6_000).toISOString(),
      message: "Replicate image prediction started",
    };
  }

  const pollResponse = await fetch(`${REPLICATE_API_URL}/predictions/${generation.provider_job_id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const pollText = await pollResponse.text();
  if (!pollResponse.ok) throw new Error(`Replicate image polling failed [${pollResponse.status}]: ${pollText}`);

  const prediction = safeJsonParse(pollText);
  const status = String(prediction?.status ?? "processing");
  if (["starting", "processing"].includes(status)) {
    await supabase
      .from("media_generations")
      .update({
        provider_key: provider.provider_key,
        status: "generating",
        updated_at: new Date().toISOString(),
        metadata: { ...metadata, adapter: "replicate-image", model, prediction_status: status },
      })
      .eq("id", generation.id);
    return {
      status: "deferred",
      nextRetryAt: new Date(Date.now() + 6_000).toISOString(),
      message: `Replicate image status: ${status}`,
    };
  }

  if (["failed", "canceled"].includes(status)) {
    throw new Error(String(prediction?.error ?? `Replicate image prediction ${status}`));
  }
  if (status !== "succeeded") {
    return {
      status: "deferred",
      nextRetryAt: new Date(Date.now() + 6_000).toISOString(),
      message: `Replicate image status: ${status}`,
    };
  }

  const resultUrl = extractReplicateOutputUrl(prediction?.output);
  if (!resultUrl) throw new Error("Replicate did not return a usable image URL");
  const persistentUrl = await persistRemoteImage(supabase, generation, resultUrl);

  await finalizeImageSuccess(
    supabase,
    generation,
    provider.provider_key,
    persistentUrl,
    generation.provider_job_id,
    {
      ...metadata,
      adapter: "replicate-image",
      model,
      prediction_status: status,
      completed_by: WORKER_ID,
      output_kind: "image",
    },
  );
  return { status: "completed" };
}

async function finalizeImageSuccess(
  supabase: any,
  generation: any,
  providerKey: string,
  resultUrl: string,
  providerJobId: string,
  metadata: Record<string, unknown>,
) {
  await supabase
    .from("media_generations")
    .update({
      provider_key: providerKey,
      status: "completed",
      result_url: resultUrl,
      provider_job_id: providerJobId,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
      metadata,
    })
    .eq("id", generation.id);

  await supabase.from("media_usage_events").insert({
    generation_id: generation.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    media_type: "image",
    event_type: "completed",
    status: "completed",
    provider_key: providerKey,
    metadata: { result_url: resultUrl },
  });

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("images_generated_this_month")
    .eq("user_id", generation.user_id)
    .maybeSingle();
  const nextValue = Number(subscription?.images_generated_this_month ?? 0) + 1;
  await supabase
    .from("subscriptions")
    .update({ images_generated_this_month: nextValue })
    .eq("user_id", generation.user_id);
}

async function finalizeImageFailure(supabase: any, job: any, errorMessage: string, attempts: number) {
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
    media_type: "image",
    error_stage: "processing",
    error_message: errorMessage,
    error_details: { attempts },
  });

  await supabase.from("media_usage_events").insert({
    generation_id: generation.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    media_type: "image",
    event_type: "failed",
    status: "failed",
    provider_key: generation.provider_key,
    metadata: { attempts, error: errorMessage },
  });

  const { data: daily } = await supabase
    .from("media_usage_daily")
    .select("image_count")
    .eq("user_id", generation.user_id)
    .maybeSingle();
  await supabase
    .from("media_usage_daily")
    .update({ image_count: Math.max(0, Number(daily?.image_count ?? 1) - 1) })
    .eq("user_id", generation.user_id);

  await supabase.from("media_usage_events").insert({
    generation_id: generation.id,
    user_id: generation.user_id,
    workspace_id: generation.workspace_id,
    media_type: "image",
    event_type: "refund",
    status: "refunded",
    provider_key: generation.provider_key,
    metadata: { reason: "provider_failure" },
  });
}

async function persistRemoteImage(supabase: any, generation: any, remoteUrl: string) {
  const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Failed to download generated image [${response.status}]`);

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  const filePath = `${generation.user_id}/${generation.id}.${extension}`;
  const bytes = new Uint8Array(await response.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("generated-media")
    .upload(filePath, bytes, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  return supabase.storage.from("generated-media").getPublicUrl(filePath).data.publicUrl;
}

async function resolveProviderSecret(supabase: any, provider: any) {
  const envSecretName = provider.api_secret_name ? String(provider.api_secret_name) : null;
  const envSecretValue = envSecretName ? Deno.env.get(envSecretName) : null;
  if (envSecretValue) return envSecretValue;

  const { data: credential, error } = await supabase
    .from("media_provider_credentials")
    .select("encrypted_secret")
    .eq("provider_key", provider.provider_key)
    .maybeSingle();
  if (error) throw error;
  if (!credential?.encrypted_secret) return null;
  return await decryptSecret(String(credential.encrypted_secret));
}

async function decryptSecret(payload: string) {
  const [ivBase64, encryptedBase64] = payload.split(".");
  if (!ivBase64 || !encryptedBase64) throw new Error("Invalid encrypted provider secret");

  const rootSecret = getServiceKey();
  if (!rootSecret) throw new Error("Service role key is not configured");
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(rootSecret));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivBase64) },
    key,
    fromBase64(encryptedBase64),
  );
  return textDecoder.decode(decrypted);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function extractReplicateOutputUrl(output: unknown) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const direct = output.find((item) => typeof item === "string");
    if (typeof direct === "string") return direct;
    const objectUrl = output.find(
      (item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string",
    ) as Record<string, unknown> | undefined;
    if (typeof objectUrl?.url === "string") return objectUrl.url;
  }
  if (output && typeof output === "object" && typeof (output as Record<string, unknown>).url === "string") {
    return String((output as Record<string, unknown>).url);
  }
  return null;
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });
}
