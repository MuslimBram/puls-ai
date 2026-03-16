import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Plan limits (server-side enforcement)
const MEDIA_LIMITS: Record<string, { images: number; videos: number; maxSeconds: number }> = {
  standard: { images: 5, videos: 0, maxSeconds: 0 },
  professional: { images: 30, videos: 5, maxSeconds: 30 },
  advanced: { images: 100, videos: 20, maxSeconds: 60 },
  enterprise: { images: -1, videos: -1, maxSeconds: -1 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const user = userData.user;

    const { mediaType, prompt, durationSeconds, workspaceId } = await req.json();

    if (!mediaType || !prompt) throw new Error("mediaType and prompt required");

    // Get subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, images_generated_this_month, videos_generated_this_month")
      .eq("user_id", user.id)
      .maybeSingle();

    const plan = sub?.plan || "standard";
    const planMap: Record<string, string> = { free: "standard", pro: "professional" };
    const normalizedPlan = planMap[plan] || plan;
    const limits = MEDIA_LIMITS[normalizedPlan] || MEDIA_LIMITS.standard;

    // Check limits
    if (mediaType === "image") {
      const used = sub?.images_generated_this_month || 0;
      // Check addons
      let addonRemaining = 0;
      if (workspaceId) {
        const { data: addons } = await supabase
          .from("media_addons")
          .select("remaining")
          .eq("workspace_id", workspaceId)
          .eq("addon_type", "image")
          .gt("remaining", 0);
        addonRemaining = (addons || []).reduce((s: number, a: any) => s + Number(a.remaining), 0);
      }

      if (limits.images !== -1 && used >= limits.images && addonRemaining <= 0) {
        return new Response(JSON.stringify({
          error: `Image limit reached (${used}/${limits.images}). Purchase addon credits.`,
          allowed: false,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (mediaType === "video") {
      if (limits.videos === 0) {
        return new Response(JSON.stringify({
          error: "Video generation not available on your plan.",
          allowed: false,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const used = sub?.videos_generated_this_month || 0;
      if (limits.videos !== -1 && used >= limits.videos) {
        return new Response(JSON.stringify({
          error: `Video limit reached (${used}/${limits.videos}).`,
          allowed: false,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (limits.maxSeconds !== -1 && durationSeconds > limits.maxSeconds) {
        return new Response(JSON.stringify({
          error: `Max video duration is ${limits.maxSeconds}s on your plan.`,
          allowed: false,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Create media generation record
    const { data: gen, error: genErr } = await supabase.from("media_generations").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      media_type: mediaType,
      prompt,
      duration_seconds: durationSeconds || null,
      status: "processing",
    }).select("id").single();

    if (genErr) throw genErr;

    // Increment usage counter
    const field = mediaType === "image" ? "images_generated_this_month" : "videos_generated_this_month";
    const currentVal = Number((sub as any)?.[field]) || 0;
    await supabase.from("subscriptions").update({ [field]: currentVal + 1 }).eq("user_id", user.id);

    // Deduct addon if over plan limit
    if (mediaType === "image" && limits.images !== -1 && currentVal >= limits.images && workspaceId) {
      const { data: addon } = await supabase
        .from("media_addons")
        .select("id, remaining")
        .eq("workspace_id", workspaceId)
        .eq("addon_type", "image")
        .gt("remaining", 0)
        .order("purchased_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (addon) {
        await supabase.from("media_addons").update({
          remaining: Number(addon.remaining) - 1,
        }).eq("id", addon.id);
      }
    }

    // TODO: Call actual AI generation service here
    // For now, mark as completed with placeholder
    await supabase.from("media_generations").update({
      status: "completed",
      result_url: `https://placeholder.com/generated-${mediaType}-${gen.id}`,
    }).eq("id", gen.id);

    return new Response(JSON.stringify({
      allowed: true,
      generationId: gen.id,
      message: "Media generation queued successfully.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("generate-media error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
