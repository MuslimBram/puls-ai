import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const WORKER_ID = crypto.randomUUID().slice(0, 8);
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
const REPLICATE_API_URL = "https://api.replicate.com/v1";
const REPLICATE_DEFAULT_MODEL = "minimax/video-01";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

    case "scan_post_process":
      return await processScanPostProcessJob(supabase, job, payload);

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

async function processScanPostProcessJob(supabase: any, job: any, payload: Record<string, unknown>): Promise<JobOutcome> {
  const scanHistoryId = String(payload.scan_history_id ?? "");
  const businessId = String(payload.business_id ?? "");

  if (!scanHistoryId || !businessId) {
    throw new Error("Missing scan_history_id or business_id in scan post-process job payload");
  }

  const { data: business, error: businessError } = await supabase
    .from("business_profiles")
    .select("id, user_id, workspace_id, business_name, industry, ai_tone, short_description, target_audience, main_services")
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) throw businessError;
  if (!business) throw new Error(`Business ${businessId} not found`);

  const { data: scan, error: scanError } = await supabase
    .from("business_scan_history")
    .select("id, scanned_url, status, pages_scanned, summary_json, products_found, services_found, contact_methods, social_links, pricing_signals, tone_of_voice, suggested_keywords, cta_signals, competitor_hints, completed_at, created_at")
    .eq("id", scanHistoryId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (scanError) throw scanError;
  if (!scan) throw new Error(`Scan ${scanHistoryId} not found`);

  if (scan.status !== "completed") {
    return {
      status: "deferred",
      nextRetryAt: new Date(Date.now() + 15000).toISOString(),
      message: `Scan status is ${scan.status}`,
    };
  }

  try {
    await updateScanAutomationState(supabase, scan.id, {
      status: "processing",
      profile_sync: "processing",
      knowledge_sync: "processing",
      started_at: new Date().toISOString(),
      error: null,
    }, scan.summary_json);

    const profilePatch = buildBusinessProfilePatch(business, scan);
    if (Object.keys(profilePatch).length > 0) {
      await supabase.from("business_profiles").update(profilePatch).eq("id", business.id);
    }

    const knowledgeResult = await upsertKnowledgeFromScan(supabase, business, scan, job);

    await updateScanAutomationState(supabase, scan.id, {
      status: "completed",
      profile_sync: "completed",
      knowledge_sync: "completed",
      completed_at: new Date().toISOString(),
      error: null,
      updated_fields: Object.keys(profilePatch).filter((field) => field !== "updated_at"),
      knowledge_source_id: knowledgeResult.sourceId,
      knowledge_source_name: knowledgeResult.sourceName,
      knowledge_chunks_created: knowledgeResult.chunksCreated,
    });

    await supabase.from("business_notifications").insert({
      user_id: business.user_id,
      workspace_id: business.workspace_id,
      title: "Scan automation completed",
      message: `${business.business_name} scan insights were synced to the business profile and Knowledge Base.`,
      notification_type: "system",
      category: "automation",
      metadata: {
        business_id: business.id,
        scan_history_id: scan.id,
        knowledge_source_id: knowledgeResult.sourceId,
        updated_fields: Object.keys(profilePatch).filter((field) => field !== "updated_at"),
      },
    });

    return { status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scan post-processing error";
    const nextAttempt = Number(job.attempts ?? 0) + 1;
    const isTerminal = nextAttempt >= Number(job.max_attempts ?? 5);

    await updateScanAutomationState(supabase, scan.id, {
      status: isTerminal ? "failed" : "retrying",
      profile_sync: isTerminal ? "failed" : "processing",
      knowledge_sync: isTerminal ? "failed" : "processing",
      error: message,
      failed_at: isTerminal ? new Date().toISOString() : undefined,
      last_error_at: new Date().toISOString(),
    }, scan.summary_json);

    if (isTerminal) {
      await supabase.from("business_notifications").insert({
        user_id: business.user_id,
        workspace_id: business.workspace_id,
        title: "Scan automation failed",
        message: `${business.business_name} scan automation could not finish. ${message}`,
        notification_type: "warning",
        category: "automation",
        metadata: {
          business_id: business.id,
          scan_history_id: scan.id,
          error: message,
        },
      });
    }

    throw error;
  }
}

async function updateScanAutomationState(
  supabase: any,
  scanHistoryId: string,
  patch: Record<string, unknown>,
  existingSummary?: Record<string, unknown> | null,
) {
  let summary = existingSummary && typeof existingSummary === "object"
    ? { ...existingSummary }
    : null;

  if (!summary) {
    const { data: current } = await supabase
      .from("business_scan_history")
      .select("summary_json")
      .eq("id", scanHistoryId)
      .maybeSingle();

    summary = current?.summary_json && typeof current.summary_json === "object"
      ? { ...(current.summary_json as Record<string, unknown>) }
      : {};
  }

  const automation = summary.automation && typeof summary.automation === "object"
    ? { ...(summary.automation as Record<string, unknown>) }
    : {};

  const nextSummary = {
    ...summary,
    automation: {
      ...automation,
      ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    },
  };

  await supabase
    .from("business_scan_history")
    .update({ summary_json: nextSummary })
    .eq("id", scanHistoryId);

  return nextSummary;
}

function buildBusinessProfilePatch(business: any, scan: any) {
  const summary = toRecord(scan.summary_json);
  const serviceTitles = uniqueStrings((scan.services_found ?? []).map((service: Record<string, unknown>) => String(service.title ?? "")));
  const patch: Record<string, unknown> = {};

  if (!business.industry && typeof summary.industry === "string" && summary.industry.trim()) {
    patch.industry = summary.industry.trim();
  }

  if (!business.ai_tone && typeof scan.tone_of_voice === "string" && scan.tone_of_voice.trim()) {
    patch.ai_tone = scan.tone_of_voice.trim();
  }

  if (!business.short_description && typeof summary.business_summary === "string" && summary.business_summary.trim()) {
    patch.short_description = summary.business_summary.trim();
  }

  if (!business.target_audience && typeof summary.target_audience === "string" && summary.target_audience.trim()) {
    patch.target_audience = summary.target_audience.trim();
  }

  if (!business.main_services && serviceTitles.length) {
    patch.main_services = serviceTitles.join(", ");
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
  }

  return patch;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stringifyScanSummary(summary: Record<string, unknown> | null | undefined) {
  if (!summary || typeof summary !== "object") return "";
  return Object.entries(summary)
    .filter(([key, value]) => key !== "automation" && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

function buildScanKnowledgeChunks(business: any, scan: any) {
  const chunks: Array<{ title: string; content: string; topicTags: string[] }> = [];
  const summaryText = stringifyScanSummary(toRecord(scan.summary_json));
  const baseTags = uniqueStrings([
    "business-scan",
    String(business.business_name ?? ""),
    String(business.industry ?? ""),
    String(scan.tone_of_voice ?? ""),
    ...((scan.suggested_keywords ?? []) as string[]),
  ]);

  const addChunk = (title: string, lines: Array<string | null | undefined>, extraTags: string[] = []) => {
    const content = lines.filter(Boolean).join("\n").trim();
    if (!content) return;
    chunks.push({
      title,
      content,
      topicTags: uniqueStrings([...baseTags, ...extraTags]),
    });
  };

  addChunk(
    "Business scan overview",
    [
      `Business: ${business.business_name}`,
      business.industry ? `Industry: ${business.industry}` : null,
      business.target_audience ? `Target audience: ${business.target_audience}` : null,
      business.main_services ? `Main services: ${business.main_services}` : null,
      business.short_description ? `Description: ${business.short_description}` : null,
      `Scanned URL: ${scan.scanned_url}`,
      scan.tone_of_voice ? `Detected tone of voice: ${scan.tone_of_voice}` : null,
      summaryText ? `Summary:\n${summaryText}` : null,
    ],
    ["overview", "summary"],
  );

  addChunk(
    "Products and services",
    [
      ...((scan.products_found ?? []) as Record<string, unknown>[]).map((product, index) =>
        `Product ${index + 1}: ${String(product.title ?? "Untitled")}${product.description ? ` — ${String(product.description)}` : ""}${product.pricing_signal ? ` (pricing: ${String(product.pricing_signal)})` : ""}`,
      ),
      ...((scan.services_found ?? []) as Record<string, unknown>[]).map((service, index) =>
        `Service ${index + 1}: ${String(service.title ?? "Untitled")}${service.description ? ` — ${String(service.description)}` : ""}`,
      ),
    ],
    ["products", "services"],
  );

  addChunk(
    "Contact and conversion signals",
    [
      ...((scan.contact_methods ?? []) as Record<string, unknown>[]).map((contact, index) =>
        `Contact ${index + 1}: ${String(contact.type ?? "method")} — ${String(contact.value ?? "")}`,
      ),
      ...((scan.pricing_signals ?? []) as Array<Record<string, unknown> | string>).map((signal, index) =>
        `Pricing signal ${index + 1}: ${typeof signal === "string" ? signal : String(signal.signal ?? "")}`,
      ),
      ...((scan.cta_signals ?? []) as Array<Record<string, unknown> | string>).map((cta, index) =>
        `CTA ${index + 1}: ${typeof cta === "string" ? cta : String(cta.cta ?? "")}`,
      ),
    ],
    ["contact", "pricing", "cta"],
  );

  addChunk(
    "Audience and market intelligence",
    [
      (scan.suggested_keywords ?? []).length ? `Suggested keywords: ${(scan.suggested_keywords as string[]).join(", ")}` : null,
      ...((scan.competitor_hints ?? []) as Record<string, unknown>[]).map((competitor, index) =>
        `Competitor ${index + 1}: ${String(competitor.name ?? "Unknown")}${competitor.url ? ` — ${String(competitor.url)}` : ""}`,
      ),
      ...Object.entries(toRecord(scan.social_links)).map(([platform, urls]) => `${platform}: ${Array.isArray(urls) ? urls.join(", ") : String(urls)}`),
    ],
    ["keywords", "competitors", "social"],
  );

  return chunks;
}

async function upsertKnowledgeFromScan(supabase: any, business: any, scan: any, job: any) {
  const chunks = buildScanKnowledgeChunks(business, scan);
  if (!chunks.length) {
    throw new Error("No structured scan content was available to sync into Knowledge Base");
  }

  const sourceName = `${business.business_name} — Website Scan Insights`;
  const metadata = {
    origin: "business_scan",
    business_id: business.id,
    scan_history_id: scan.id,
    scanned_url: scan.scanned_url,
    synced_by_job_id: job.id,
    synced_at: new Date().toISOString(),
    pages_crawled: scan.pages_scanned || 0,
    total_chunks: chunks.length,
    topics: uniqueStrings(chunks.flatMap((chunk) => chunk.topicTags)).slice(0, 20),
  };

  const { data: existingSource, error: existingSourceError } = await supabase
    .from("knowledge_sources")
    .select("id")
    .eq("user_id", business.user_id)
    .eq("business_id", business.id)
    .eq("source_name", sourceName)
    .eq("source_url", scan.scanned_url)
    .maybeSingle();

  if (existingSourceError) throw existingSourceError;

  let sourceId = existingSource?.id as string | undefined;

  if (sourceId) {
    const { error: updateSourceError } = await supabase
      .from("knowledge_sources")
      .update({
        workspace_id: business.workspace_id,
        business_id: business.id,
        source_type: "website",
        status: "active",
        is_enabled: true,
        last_scanned_at: new Date().toISOString(),
        metadata,
      })
      .eq("id", sourceId);
    if (updateSourceError) throw updateSourceError;

    const { error: deleteChunksError } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("source_id", sourceId);
    if (deleteChunksError) throw deleteChunksError;
  } else {
    const { data: createdSource, error: createSourceError } = await supabase
      .from("knowledge_sources")
      .insert({
        user_id: business.user_id,
        workspace_id: business.workspace_id,
        business_id: business.id,
        source_type: "website",
        source_name: sourceName,
        source_url: scan.scanned_url,
        status: "active",
        is_enabled: true,
        last_scanned_at: new Date().toISOString(),
        metadata,
      })
      .select("id")
      .single();

    if (createSourceError) throw createSourceError;
    sourceId = createdSource.id;
  }

  const chunkRows = chunks.map((chunk, index) => ({
    user_id: business.user_id,
    workspace_id: business.workspace_id,
    business_id: business.id,
    source_id: sourceId!,
    content: chunk.content,
    summary: chunk.content.slice(0, 200),
    topic_tags: chunk.topicTags,
    content_type: "business_scan",
    page_url: scan.scanned_url,
    page_title: chunk.title,
    chunk_index: index,
    word_count: chunk.content.split(/\s+/).filter(Boolean).length,
  }));

  const { error: chunksInsertError } = await supabase.from("knowledge_chunks").insert(chunkRows);
  if (chunksInsertError) throw chunksInsertError;

  return { sourceId, sourceName, chunksCreated: chunkRows.length };
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

    return await processConfiguredVideoGeneration(supabase, generation, provider);
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

async function processConfiguredVideoGeneration(supabase: any, generation: any, provider: any): Promise<JobOutcome> {
  const providerConfig = toRecord(provider.config);
  const adapter = String(providerConfig.adapter ?? provider.provider_key);

  switch (adapter) {
    case "replicate":
    case "replicate-video":
      return await processReplicateVideoGeneration(supabase, generation, provider, providerConfig);
    default:
      throw new Error(`No registered runtime handler for video provider ${provider.provider_key}`);
  }
}

async function processMockVideoGeneration(supabase: any, generation: any, provider: any): Promise<JobOutcome> {
  const metadata = toRecord(generation.metadata);
  const providerConfig = toRecord(provider.config);
  const minDelayMs = Number(providerConfig.minDelayMs ?? 8000);
  const maxDelayMs = Number(providerConfig.maxDelayMs ?? 18000);
  const failureRate = clamp(Number(providerConfig.failureRate ?? 0), 0, 1);
  const delayMs = randomInt(minDelayMs, maxDelayMs);

  if (!generation.provider_job_id || !metadata.ready_at) {
    const readyAt = new Date(Date.now() + delayMs).toISOString();
    const providerJobId = generation.provider_job_id ?? `mock_${crypto.randomUUID()}`;
    const shouldFail = typeof metadata.should_fail === "boolean" ? metadata.should_fail : Math.random() < failureRate;

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
          should_fail: shouldFail,
        },
      })
      .eq("id", generation.id);

    return { status: "deferred", nextRetryAt: readyAt, message: "Mock video render in progress" };
  }

  if (new Date(metadata.ready_at as string).getTime() > Date.now()) {
    return { status: "deferred", nextRetryAt: String(metadata.ready_at), message: "Mock video still rendering" };
  }

  if (metadata.should_fail === true) {
    throw new Error("Mock video provider simulated a rendering failure");
  }

  const posterSvg = createMockVideoPoster({
    prompt: generation.prompt ?? "Mock video",
    durationSeconds: generation.duration_seconds ?? 10,
    providerName: provider.provider_name,
  });

  const filePath = `${generation.user_id}/${generation.id}-mock-video.svg`;
  const bytes = textEncoder.encode(posterSvg);

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

async function processReplicateVideoGeneration(
  supabase: any,
  generation: any,
  provider: any,
  providerConfig: Record<string, unknown>,
): Promise<JobOutcome> {
  const token = await resolveProviderSecret(supabase, provider);
  if (!token) {
    throw new Error(`No credential available for video provider ${provider.provider_key}`);
  }

  const model = String(providerConfig.model ?? REPLICATE_DEFAULT_MODEL);
  const promptField = String(providerConfig.prompt_field ?? "prompt");
  const durationField = typeof providerConfig.duration_field === "string" ? providerConfig.duration_field : null;
  const inputDefaults = toRecord(providerConfig.input_defaults);
  const predictionOptions = toRecord(providerConfig.prediction_options);
  const metadata = toRecord(generation.metadata);

  if (!generation.provider_job_id) {
    const input: Record<string, unknown> = {
      ...inputDefaults,
      [promptField]: generation.prompt,
    };

    if (durationField && generation.duration_seconds) {
      input[durationField] = generation.duration_seconds;
    }

    const createResponse = await fetch(`${REPLICATE_API_URL}/models/${model}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...predictionOptions,
        input,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const createBodyText = await createResponse.text();
    if (!createResponse.ok) {
      throw new Error(`Replicate create failed [${createResponse.status}]: ${createBodyText}`);
    }

    const created = safeJsonParse(createBodyText);
    const providerJobId = String(created?.id ?? "");
    if (!providerJobId) {
      throw new Error("Replicate did not return a prediction id");
    }

    const nextRetryAt = new Date(Date.now() + 8000).toISOString();
    await supabase
      .from("media_generations")
      .update({
        provider_job_id: providerJobId,
        status: "generating",
        updated_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          adapter: "replicate",
          model,
          poll_url: created?.urls?.get ?? null,
          prediction_status: created?.status ?? "starting",
          input_payload: input,
        },
      })
      .eq("id", generation.id);

    return { status: "deferred", nextRetryAt, message: "Replicate video prediction started" };
  }

  const pollResponse = await fetch(`${REPLICATE_API_URL}/predictions/${generation.provider_job_id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  const pollBodyText = await pollResponse.text();
  if (!pollResponse.ok) {
    throw new Error(`Replicate polling failed [${pollResponse.status}]: ${pollBodyText}`);
  }

  const prediction = safeJsonParse(pollBodyText);
  const status = String(prediction?.status ?? "processing");

  await supabase
    .from("media_generations")
    .update({
      status: ["succeeded"].includes(status) ? "completed" : ["failed", "canceled"].includes(status) ? "failed" : "generating",
      updated_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        adapter: "replicate",
        model,
        prediction_status: status,
        replicate_metrics: prediction?.metrics ?? null,
      },
    })
    .eq("id", generation.id);

  if (["starting", "processing"].includes(status)) {
    return {
      status: "deferred",
      nextRetryAt: new Date(Date.now() + 8000).toISOString(),
      message: `Replicate status: ${status}`,
    };
  }

  if (["failed", "canceled"].includes(status)) {
    throw new Error(String(prediction?.error ?? `Replicate prediction ${status}`));
  }

  if (status !== "succeeded") {
    return {
      status: "deferred",
      nextRetryAt: new Date(Date.now() + 8000).toISOString(),
      message: `Replicate status: ${status}`,
    };
  }

  const resultUrl = extractReplicateOutputUrl(prediction?.output);
  if (!resultUrl) {
    throw new Error("Replicate did not return a usable result URL");
  }

  await finalizeMediaGenerationSuccess(supabase, generation, {
    providerKey: provider.provider_key,
    resultUrl,
    providerJobId: generation.provider_job_id,
    metadata: {
      ...metadata,
      adapter: "replicate",
      model,
      prediction_status: status,
      completed_by: WORKER_ID,
      output_kind: inferVideoOutputKind(resultUrl),
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

  const rootSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
    const firstString = output.find((item) => typeof item === "string");
    if (typeof firstString === "string") return firstString;

    const firstUrl = output.find((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string") as Record<string, unknown> | undefined;
    if (firstUrl?.url && typeof firstUrl.url === "string") return firstUrl.url;
  }
  if (output && typeof output === "object" && typeof (output as Record<string, unknown>).url === "string") {
    return String((output as Record<string, unknown>).url);
  }
  return null;
}

function inferVideoOutputKind(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) ? "video" : "video_preview";
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
