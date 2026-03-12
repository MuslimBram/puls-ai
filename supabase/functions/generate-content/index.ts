import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const { content_type, count, custom_prompt } = await req.json();
    const postCount = Math.min(count || 5, 10);
    const type = content_type || "promotional";

    // Get business profile
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Get content knowledge
    const { data: knowledge } = await supabase
      .from("content_knowledge")
      .select("extracted_data")
      .eq("user_id", userId)
      .order("scanned_at", { ascending: false })
      .limit(3);

    const businessContext = profile
      ? `Business: ${profile.business_name}. Industry: ${profile.industry || "N/A"}. Services: ${profile.main_services || "N/A"}. Audience: ${profile.target_audience || "N/A"}. Tone: ${profile.ai_tone || "professional"}. Description: ${profile.short_description || "N/A"}.`
      : "No business profile available.";

    const knowledgeContext = knowledge?.length
      ? `Scanned data: ${JSON.stringify(knowledge.map(k => k.extracted_data).slice(0, 2))}`
      : "";

    const contentTypePrompts: Record<string, string> = {
      promotional: "Create promotional posts highlighting products/services with compelling CTAs.",
      educational: "Create educational posts sharing industry knowledge and tips.",
      engagement: "Create engagement posts with questions, polls, or conversation starters.",
      seasonal: "Create seasonal/trending posts relevant to current events or holidays.",
      testimonial: "Create testimonial-style posts showcasing customer success stories.",
    };

    const systemPrompt = `You are a social media content strategist. Generate ${postCount} unique social media posts.

${businessContext}
${knowledgeContext}

${contentTypePrompts[type] || contentTypePrompts.promotional}

${custom_prompt ? `Additional instructions: ${custom_prompt}` : ""}

For each post, provide a complete post ready for social media.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate ${postCount} ${type} social media posts.` }
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_posts",
            description: "Generate social media posts",
            parameters: {
              type: "object",
              properties: {
                posts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Short title for the post" },
                      caption: { type: "string", description: "Full post caption text" },
                      hashtags: { type: "array", items: { type: "string" } },
                      cta: { type: "string", description: "Call-to-action text" },
                      media_type: { type: "string", enum: ["image", "reel", "story", "carousel"] },
                      suggested_networks: { type: "array", items: { type: "string", enum: ["facebook", "instagram", "linkedin", "tiktok", "twitter"] } }
                    },
                    required: ["title", "caption", "hashtags", "cta", "media_type", "suggested_networks"],
                    additionalProperties: false
                  }
                }
              },
              required: ["posts"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_posts" } }
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw new Error("AI generation failed");
    }

    const aiData = await aiRes.json();
    let posts: Array<Record<string, unknown>> = [];

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        posts = parsed.posts || [];
      } catch {
        throw new Error("Failed to parse AI response");
      }
    }

    // Store posts as drafts and ideas
    const insertedPosts = [];
    for (const post of posts) {
      const { data: inserted } = await supabase
        .from("content_posts")
        .insert({
          user_id: userId,
          title: post.title as string,
          caption: post.caption as string,
          hashtags: (post.hashtags as string[]) || [],
          cta: post.cta as string,
          media_type: (post.media_type as string) || "image",
          content_type: type,
          target_networks: (post.suggested_networks as string[]) || [],
          status: "draft",
          ai_generated: true,
        })
        .select()
        .single();
      if (inserted) insertedPosts.push(inserted);

      // Also save as idea
      await supabase.from("content_ideas").insert({
        user_id: userId,
        idea_text: `${post.title}: ${(post.caption as string || "").slice(0, 200)}`,
        content_type: type,
        suggested_media: (post.media_type as string) || "image",
      });
    }

    return new Response(JSON.stringify({ success: true, posts: insertedPosts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("generate-content error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
