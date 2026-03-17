import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEDIA_LIMITS: Record<string, { images: number; videos: number; maxSeconds: number }> = {
  standard: { images: 5, videos: 0, maxSeconds: 0 },
  professional: { images: 30, videos: 5, maxSeconds: 30 },
  advanced: { images: 100, videos: 20, maxSeconds: 60 },
  enterprise: { images: -1, videos: -1, maxSeconds: -1 },
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

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

    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const user = userData.user;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    // === Check limits ===
    if (mediaType === "image") {
      const used = sub?.images_generated_this_month || 0;
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
      // Video not yet supported via AI gateway — return graceful message
      return new Response(JSON.stringify({
        error: "Video generation is coming soon. Image generation is fully available.",
        allowed: false,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === Create media generation record ===
    const { data: gen, error: genErr } = await supabase.from("media_generations").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      media_type: mediaType,
      prompt,
      duration_seconds: durationSeconds || null,
      status: "processing",
    }).select("id").single();

    if (genErr) throw genErr;

    // === Call Lovable AI Gateway for image generation ===
    console.log("Calling AI Gateway for image generation, gen:", gen.id);

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [
          {
            role: "user",
            content: `Generate an image based on this description: ${prompt}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);

      // Mark as failed
      await supabase.from("media_generations").update({ status: "failed" }).eq("id", gen.id);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later.", allowed: false }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds.", allowed: false }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received, extracting image...");

    // Extract image data from response
    // Gemini image models return inline_data with base64 image in parts
    let imageBase64: string | null = null;
    let mimeType = "image/png";

    const choice = aiData.choices?.[0];
    if (choice?.message?.content) {
      // Check if content is an array of parts (multimodal response)
      const content = choice.message.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "image_url" && part.image_url?.url) {
            // data:image/png;base64,... format
            const dataUrl = part.image_url.url;
            const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
            if (match) {
              mimeType = match[1];
              imageBase64 = match[2];
            }
          } else if (part.inline_data) {
            mimeType = part.inline_data.mime_type || "image/png";
            imageBase64 = part.inline_data.data;
          }
        }
      } else if (typeof content === "string") {
        // Some models return base64 directly in text or as data URL
        const dataUrlMatch = content.match(/data:(image\/[^;]+);base64,([A-Za-z0-9+/=]+)/);
        if (dataUrlMatch) {
          mimeType = dataUrlMatch[1];
          imageBase64 = dataUrlMatch[2];
        }
      }
    }

    if (!imageBase64) {
      console.error("No image data in AI response:", JSON.stringify(aiData).slice(0, 500));
      await supabase.from("media_generations").update({
        status: "failed",
      }).eq("id", gen.id);
      return new Response(JSON.stringify({
        error: "AI model did not return image data. Please try a different prompt.",
        allowed: false,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === Upload to storage ===
    const ext = mimeType === "image/jpeg" ? "jpg" : "png";
    const filePath = `${user.id}/${gen.id}.${ext}`;

    const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from("generated-media")
      .upload(filePath, imageBytes, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      await supabase.from("media_generations").update({ status: "failed" }).eq("id", gen.id);
      throw new Error("Failed to save generated image");
    }

    const { data: publicUrlData } = supabase.storage
      .from("generated-media")
      .getPublicUrl(filePath);

    const resultUrl = publicUrlData.publicUrl;

    // === Update record as completed ===
    await supabase.from("media_generations").update({
      status: "completed",
      result_url: resultUrl,
    }).eq("id", gen.id);

    // === Increment usage counter ===
    const field = "images_generated_this_month";
    const currentVal = Number(sub?.images_generated_this_month) || 0;
    await supabase.from("subscriptions").update({ [field]: currentVal + 1 }).eq("user_id", user.id);

    // Deduct addon if over plan limit
    if (limits.images !== -1 && currentVal >= limits.images && workspaceId) {
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

    console.log("Media generation completed:", gen.id, resultUrl);

    return new Response(JSON.stringify({
      allowed: true,
      generationId: gen.id,
      resultUrl,
      message: "Image generated successfully.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("generate-media error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
