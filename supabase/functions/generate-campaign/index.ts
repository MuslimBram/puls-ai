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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const { action, campaign_id, campaign_data } = await req.json();

    if (action === "generate_strategy") {
      // Fetch business profile and knowledge base for context
      const [profileRes, knowledgeRes] = await Promise.all([
        supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("knowledge_chunks").select("content, topic_tags, summary").eq("user_id", userId).limit(20),
      ]);

      const profile = profileRes.data;
      const knowledge = (knowledgeRes.data || []).map((k: any) => k.summary || k.content.slice(0, 200)).join("\n");

      const systemPrompt = `You are a marketing strategist AI. Generate a comprehensive campaign strategy based on the business context and campaign parameters provided. Return a JSON object with these fields:
- positioning_statement: string (1-2 sentences)
- value_proposition: string (1-2 sentences)  
- messaging_pillars: array of {pillar: string, description: string} (3-5 items)
- cta_strategy: string (recommended call-to-action approach)
- funnel_stages: array of {stage: string, goal: string, content_types: string[], description: string} (3-5 stages from awareness to conversion)
- audience_personas: array of {name: string, description: string, interests: string[], pain_points: string[]} (2-3 personas)
- content_suggestions: array of {funnel_stage: string, content_type: string, title: string, body: string, hashtags: string[], media_suggestion: string} (8-12 items across funnel stages)

Be specific, actionable, and aligned with the business identity.`;

      const userPrompt = `Business: ${profile?.business_name || "Unknown"}
Industry: ${profile?.industry || "General"}
Services: ${profile?.main_services || "Not specified"}
Target Audience: ${profile?.target_audience || "General audience"}
Tone: ${profile?.ai_tone || "professional"}

Campaign Details:
- Name: ${campaign_data.name}
- Objective: ${campaign_data.objective}
- Target Audience: ${campaign_data.target_audience || "Use business default"}
- Budget Range: $${campaign_data.budget_min || 0} - $${campaign_data.budget_max || 0}
- Duration: ${campaign_data.duration_start || "TBD"} to ${campaign_data.duration_end || "TBD"}
- Preferred Channels: ${(campaign_data.preferred_channels || []).join(", ") || "All"}

Business Knowledge Context:
${knowledge || "No additional context available."}`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "campaign_strategy",
              description: "Return the complete campaign strategy",
              parameters: {
                type: "object",
                properties: {
                  positioning_statement: { type: "string" },
                  value_proposition: { type: "string" },
                  messaging_pillars: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pillar: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["pillar", "description"],
                    },
                  },
                  cta_strategy: { type: "string" },
                  funnel_stages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        stage: { type: "string" },
                        goal: { type: "string" },
                        content_types: { type: "array", items: { type: "string" } },
                        description: { type: "string" },
                      },
                      required: ["stage", "goal", "content_types", "description"],
                    },
                  },
                  audience_personas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        interests: { type: "array", items: { type: "string" } },
                        pain_points: { type: "array", items: { type: "string" } },
                      },
                      required: ["name", "description", "interests", "pain_points"],
                    },
                  },
                  content_suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        funnel_stage: { type: "string" },
                        content_type: { type: "string" },
                        title: { type: "string" },
                        body: { type: "string" },
                        hashtags: { type: "array", items: { type: "string" } },
                        media_suggestion: { type: "string" },
                      },
                      required: ["funnel_stage", "content_type", "title", "body"],
                    },
                  },
                },
                required: ["positioning_statement", "value_proposition", "messaging_pillars", "cta_strategy", "funnel_stages", "audience_personas", "content_suggestions"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "campaign_strategy" } },
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI gateway error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No strategy generated");

      const strategy = JSON.parse(toolCall.function.arguments);

      // Update campaign with strategy
      if (campaign_id) {
        const { error: updateErr } = await supabase
          .from("campaigns")
          .update({
            positioning_statement: strategy.positioning_statement,
            value_proposition: strategy.value_proposition,
            messaging_pillars: strategy.messaging_pillars,
            cta_strategy: strategy.cta_strategy,
            funnel_stages: strategy.funnel_stages,
            audience_personas: strategy.audience_personas,
            ai_generated: true,
            status: "strategy_ready",
          })
          .eq("id", campaign_id)
          .eq("user_id", userId);
        if (updateErr) console.error("Campaign update error:", updateErr);

        // Insert content suggestions
        if (strategy.content_suggestions?.length) {
          const contentRows = strategy.content_suggestions.map((c: any, i: number) => ({
            campaign_id,
            user_id: userId,
            workspace_id: campaign_data.workspace_id || null,
            funnel_stage: c.funnel_stage || "awareness",
            content_type: c.content_type || "ad_headline",
            title: c.title,
            body: c.body,
            hashtags: c.hashtags || [],
            media_suggestion: c.media_suggestion || null,
            sort_order: i,
          }));
          await supabase.from("campaign_content").insert(contentRows);
        }
      }

      return new Response(JSON.stringify({ success: true, strategy }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-campaign error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
