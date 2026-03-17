import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseAdmin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = supabaseAdmin();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await sb.auth.getUser(jwt);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const actorId = userData.user.id;
    const { business_id, workspace_id, scan_history_id } = await req.json();
    if (!business_id || !workspace_id) throw new Error("business_id and workspace_id required");

    const { data: roleRows, error: roleError } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", actorId)
      .in("role", ["admin", "super_admin"])
      .limit(1);
    if (roleError) throw roleError;
    if (!roleRows || roleRows.length === 0) throw new Error("Forbidden");

    const { data: business, error: businessError } = await sb
      .from("business_profiles")
      .select("id, user_id, workspace_id, business_name, industry, ai_tone, short_description, target_audience, main_services")
      .eq("id", business_id)
      .single();
    if (businessError) throw businessError;
    if (!business) throw new Error("Business not found");
    if (business.workspace_id !== workspace_id) throw new Error("Workspace mismatch for business");

    let scanData: any = null;
    if (scan_history_id) {
      const { data, error } = await sb
        .from("business_scan_history")
        .select("*")
        .eq("id", scan_history_id)
        .eq("business_id", business_id)
        .eq("workspace_id", workspace_id)
        .single();
      if (error) throw error;
      scanData = data;
    } else {
      const { data, error } = await sb
        .from("business_scan_history")
        .select("*")
        .eq("business_id", business_id)
        .eq("workspace_id", workspace_id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      scanData = data;
    }

    if (!scanData) throw new Error("No completed scan found for this business");
    if (scanData.status !== "completed") throw new Error("Only completed scans can generate AI content");

    const { data: contentRecord, error: insertErr } = await sb
      .from("business_ai_content")
      .insert({
        business_id,
        workspace_id,
        scan_history_id: scanData.id,
        generated_by: actorId,
        content_type: "campaign_ideas",
        status: "generating",
      } as any)
      .select()
      .single();
    if (insertErr) throw insertErr;

    const contentId = (contentRecord as any).id;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const biz = business as any;
    const sd = scanData as any;
    let context = `Business: ${biz.business_name}\nIndustry: ${biz.industry || "Unknown"}\nTarget Audience: ${biz.target_audience || "General"}\nTone: ${biz.ai_tone || sd.tone_of_voice || "professional"}\nServices: ${biz.main_services || "N/A"}\nDescription: ${biz.short_description || "N/A"}\nScanned URL: ${sd.scanned_url || "N/A"}`;

    context += `\n\nFrom completed website scan:`;
    if (sd.products_found?.length) context += `\nProducts: ${JSON.stringify(sd.products_found.slice(0, 5))}`;
    if (sd.services_found?.length) context += `\nServices: ${JSON.stringify(sd.services_found.slice(0, 5))}`;
    if (sd.tone_of_voice) context += `\nDetected Tone: ${sd.tone_of_voice}`;
    if (sd.suggested_keywords?.length) context += `\nKeywords: ${sd.suggested_keywords.join(", ")}`;
    if (sd.cta_signals?.length) context += `\nCTAs: ${JSON.stringify(sd.cta_signals)}`;
    if (sd.summary_json?.business_summary) context += `\nSummary: ${sd.summary_json.business_summary}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a marketing strategist. Generate actionable content ideas based on verified business profile data and a completed website scan. Return JSON via the tool.",
          },
          { role: "user", content: context },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_content_ideas",
              description: "Generate marketing content ideas",
              parameters: {
                type: "object",
                properties: {
                  post_ideas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        platform: { type: "string" },
                        content_type: { type: "string" },
                      },
                      required: ["title", "description"],
                    },
                  },
                  reel_ideas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        hook: { type: "string" },
                        script_outline: { type: "string" },
                      },
                      required: ["title", "hook"],
                    },
                  },
                  offer_ideas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        urgency_trigger: { type: "string" },
                      },
                      required: ["title", "description"],
                    },
                  },
                  funnel_suggestion: { type: "string", description: "A full funnel strategy suggestion" },
                },
                required: ["post_ideas", "reel_ideas", "offer_ideas", "funnel_suggestion"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_content_ideas" } },
      }),
    });

    let contentJson: Record<string, unknown> = {};
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        contentJson = JSON.parse(toolCall.function.arguments);
      }
    }

    await sb
      .from("business_ai_content")
      .update({
        content_json: contentJson,
        status: Object.keys(contentJson).length > 0 ? "completed" : "failed",
      } as any)
      .eq("id", contentId);

    return new Response(
      JSON.stringify({ success: true, content_id: contentId, scan_history_id: scanData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-business-content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
