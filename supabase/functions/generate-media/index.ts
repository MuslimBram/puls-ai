import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.25.76";
import { loadPricingMediaPolicy, normalizeSubscriptionPlan } from "../_shared/media-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const requestSchema = z.object({
  mediaType: z.enum(["image", "video"]),
  prompt: z.string().trim().min(4).max(4000),
  durationSeconds: z.number().int().min(1).max(120).nullable().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  businessId: z.string().uuid(),
});

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, { status: 401 });

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Not authenticated" }, { status: 401 });

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message || "Invalid request payload" }, { status: 400 });
    }

    const { mediaType, prompt, durationSeconds, workspaceId, businessId } = parsed.data;

    if (workspaceId) {
      const { data: isMember, error: memberError } = await supabase.rpc("is_workspace_member", {
        _user_id: authData.user.id,
        _workspace_id: workspaceId,
      });

      if (memberError) throw memberError;
      if (!isMember) return json({ error: "Workspace access denied" }, { status: 403 });
    }

    const [{ data: subscription, error: subscriptionError }, { data: roleRows, error: roleError }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan, workspace_id")
        .eq("user_id", authData.user.id)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id),
    ]);

    if (subscriptionError) throw subscriptionError;
    if (roleError) throw roleError;

    const roles = (roleRows ?? []).map((row) => row.role);
    const hasPrivilegedBypass = roles.includes("super_admin") || roles.includes("business_owner") || roles.includes("admin");
    const normalizedPlan = hasPrivilegedBypass ? "enterprise" : normalizeSubscriptionPlan(subscription?.plan);
    if (!normalizedPlan) {
      return json({ error: "Subscription plan unavailable." }, { status: 409 });
    }

    const policy = await loadPricingMediaPolicy(supabase, normalizedPlan);
    const resolvedWorkspaceId = workspaceId ?? subscription?.workspace_id ?? null;

    const { data: businessProfile, error: businessError } = await supabase
      .from("business_profiles")
      .select("id, workspace_id, user_id, business_name")
      .eq("id", businessId)
      .maybeSingle();

    if (businessError) throw businessError;
    if (!businessProfile) return json({ error: "Business context not found." }, { status: 404 });
    if (businessProfile.user_id !== authData.user.id) return json({ error: "Business access denied." }, { status: 403 });
    if (resolvedWorkspaceId && businessProfile.workspace_id !== resolvedWorkspaceId) {
      return json({ error: "Business does not belong to the active workspace." }, { status: 403 });
    }

    if (mediaType === "image" && !policy.allowImageGeneration) {
      return json({ allowed: false, error: "Image generation is disabled for your current plan." });
    }

    if (mediaType === "video" && !policy.allowVideoGeneration) {
      return json({ allowed: false, error: "Video generation is disabled for your current plan." });
    }

    if (mediaType === "video" && durationSeconds && policy.maxVideoSeconds !== -1 && durationSeconds > policy.maxVideoSeconds) {
      return json({ allowed: false, error: `Video duration exceeds your current limit of ${policy.maxVideoSeconds} seconds.` });
    }

    const { data: providers, error: providerError } = await supabase
      .from("media_provider_settings")
      .select("*")
      .eq("is_enabled", true)
      .order("priority", { ascending: true });

    if (providerError) throw providerError;

    const selectedProvider = (providers ?? []).find((provider) => provider.media_types.includes(mediaType));
    if (!selectedProvider) {
      return json({ allowed: false, error: `No active ${mediaType} provider is configured.` });
    }

    let dailyUsage: any;
    const { data: consumedUsage, error: consumeError } = await supabase.rpc("consume_media_quota", {
      _user_id: authData.user.id,
      _workspace_id: resolvedWorkspaceId,
      _media_type: mediaType,
      _image_limit: policy.dailyImageLimit,
      _video_limit: policy.dailyVideoLimit,
      _video_seconds_limit: policy.dailyVideoSecondsLimit,
      _requested_video_seconds: mediaType === "video" ? (durationSeconds ?? (policy.maxVideoSeconds === -1 ? 0 : policy.maxVideoSeconds)) : null,
    });

    if (consumeError) {
      const message = consumeError.message || "Unable to consume daily media quota";
      if (message.includes("MEDIA_IMAGE_DAILY_LIMIT_REACHED")) {
        return json({ allowed: false, error: `Daily image credits reached (${policy.dailyImageLimit}/${policy.dailyImageLimit}).` });
      }
      if (message.includes("MEDIA_VIDEO_DAILY_LIMIT_REACHED")) {
        return json({ allowed: false, error: `Daily video credits reached (${policy.dailyVideoLimit}/${policy.dailyVideoLimit}).` });
      }
      throw consumeError;
    }
    dailyUsage = consumedUsage;

    const resolvedDurationSeconds =
      mediaType === "video"
        ? durationSeconds ?? (policy.maxVideoSeconds === -1 ? null : policy.maxVideoSeconds)
        : null;

    const generationInsert = {
      workspace_id: resolvedWorkspaceId,
      business_id: businessProfile.id,
      user_id: authData.user.id,
      media_type: mediaType,
      duration_seconds: resolvedDurationSeconds,
      prompt,
      status: "queued",
      provider_key: selectedProvider.provider_key,
      metadata: {
        requested_at: new Date().toISOString(),
        mock: selectedProvider.is_mock,
        policy_plan_key: normalizedPlan,
        business_name: businessProfile.business_name,
      },
    };

    const { data: generation, error: generationError } = await supabase
      .from("media_generations")
      .insert(generationInsert)
      .select("id, business_id, media_type, duration_seconds, status, provider_key, created_at")
      .single();

    if (generationError) throw generationError;

    const { data: job, error: jobError } = await supabase
      .from("job_queue")
      .insert({
        user_id: authData.user.id,
        workspace_id: resolvedWorkspaceId,
        job_type: "media_generation",
        job_payload: {
          generation_id: generation.id,
          business_id: businessProfile.id,
          media_type: mediaType,
          provider_key: selectedProvider.provider_key,
        },
        status: "pending",
        attempts: 0,
        max_attempts: mediaType === "video" ? 8 : 4,
        scheduled_for: new Date().toISOString(),
        priority: mediaType === "video" ? 95 : 90,
      })
      .select("id")
      .single();

    if (jobError) throw jobError;

    await supabase
      .from("media_generations")
      .update({ job_id: job.id, updated_at: new Date().toISOString() })
      .eq("id", generation.id);

    await supabase.from("media_usage_events").insert({
      generation_id: generation.id,
      user_id: authData.user.id,
      workspace_id: resolvedWorkspaceId,
      media_type: mediaType,
      event_type: "requested",
      status: "queued",
      provider_key: selectedProvider.provider_key,
      metadata: {
        business_id: businessProfile.id,
        business_name: businessProfile.business_name,
        prompt_length: prompt.length,
        duration_seconds: mediaType === "video" ? generation.duration_seconds : null,
      },
    });

    const workerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/job-worker`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (anonKey) {
      fetch(workerUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: "generate-media", businessId: businessProfile.id }),
      }).catch((error) => console.error("Failed to trigger job-worker", error));
    }

    return json({
      allowed: true,
      generationId: generation.id,
      status: "queued",
      providerKey: selectedProvider.provider_key,
      businessId: businessProfile.id,
      message: `${mediaType === "video" ? "Video" : "Image"} job queued successfully for ${businessProfile.business_name}.`,
      usage: {
        imagesRemaining: dailyUsage.image_limit === -1 ? null : Math.max(0, dailyUsage.image_limit - dailyUsage.image_count),
        videosRemaining: dailyUsage.video_limit === -1 ? null : Math.max(0, dailyUsage.video_limit - dailyUsage.video_count),
        resetsAt: dailyUsage.window_ends_at ?? null,
      },
    });
  } catch (error) {
    console.error("generate-media error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
