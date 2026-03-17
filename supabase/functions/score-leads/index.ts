import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return jsonResponse({ error: "workspace_id required" }, 400);
    }

    const userId = userData.user.id;
    const [memberResult, ownerResult, adminResult] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspace_id }),
      supabase.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: workspace_id }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);

    if (memberResult.error) throw memberResult.error;
    if (ownerResult.error) throw ownerResult.error;
    if (adminResult.error) throw adminResult.error;

    const canScoreWorkspace = Boolean(memberResult.data || ownerResult.data || adminResult.data);
    if (!canScoreWorkspace) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, user_id, sender_name, message_content, message_date, source_type, status, detected_keyword, intent_score, workspace_id, intent_type, urgency_level")
      .eq("workspace_id", workspace_id)
      .order("message_date", { ascending: false })
      .limit(100);

    if (leadsErr) throw leadsErr;
    if (!leads || leads.length === 0) {
      return jsonResponse({ scored: 0, total: 0, predicted_pipeline_value: 0 });
    }

    const { data: memories } = await supabase
      .from("ai_conversation_memory")
      .select("contact_identifier, summary, key_facts, interaction_count")
      .eq("workspace_id", workspace_id)
      .limit(200);

    const memoryMap = new Map((memories || []).map((memory) => [memory.contact_identifier, memory]));

    const leadSummaries = leads.slice(0, 50).map((lead) => ({
      id: lead.id,
      name: lead.sender_name,
      message: (lead.message_content || "").slice(0, 300),
      channel: lead.source_type,
      keyword: lead.detected_keyword,
      intent: lead.intent_score,
      intent_type: lead.intent_type,
      urgency: lead.urgency_level,
      date: lead.message_date,
      interactions: memoryMap.get(lead.sender_name || "")?.interaction_count || 0,
    }));

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a predictive sales AI. For each lead, estimate:
- score from 0-100 based on conversion likelihood
- churn_risk from 0-100 for existing contacts
- predicted_value as a conservative whole-number revenue estimate in USD
- factors object with numeric contributions
- churn_factors object with numeric contributions

Scoring signals:
- buying intent and urgency
- source/channel quality
- keyword relevance
- interaction history
- recency
- intent type

Value estimation rules:
- Use message specificity, urgency, and commercial intent to estimate likely deal value
- If context is weak, stay conservative
- predicted_value must be an integer >= 0

Return JSON array only in this exact shape:
[{"id":"lead-uuid","score":85,"churn_risk":10,"predicted_value":2400,"factors":{"intent":30,"recency":25,"channel":15,"engagement":15},"churn_factors":{"inactivity":10}}]`,
          },
          {
            role: "user",
            content: JSON.stringify(leadSummaries),
          },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return jsonResponse({ error: "Rate limited, please try again later." }, 429);
      }
      if (aiResponse.status === 402) {
        return jsonResponse({ error: "Credits required. Please add funds." }, 402);
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";

    let scores: Array<{
      id?: string;
      score?: number;
      churn_risk?: number;
      predicted_value?: number;
      factors?: Record<string, number>;
      churn_factors?: Record<string, number>;
    }> = [];

    try {
      scores = JSON.parse(content.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    } catch {
      console.error("Failed to parse AI scores:", content);
      scores = [];
    }

    let scored = 0;
    let predictedPipelineValue = 0;

    for (const scoreEntry of scores) {
      if (!scoreEntry.id || typeof scoreEntry.score !== "number") continue;

      const predictedValue = Math.max(0, Math.round(scoreEntry.predicted_value || 0));
      predictedPipelineValue += predictedValue;

      const { error } = await supabase
        .from("lead_scores")
        .upsert(
          {
            lead_id: scoreEntry.id,
            workspace_id,
            score: Math.min(100, Math.max(0, scoreEntry.score)),
            score_factors: scoreEntry.factors || {},
            churn_risk: Math.min(100, Math.max(0, scoreEntry.churn_risk || 0)),
            churn_factors: scoreEntry.churn_factors || {},
            predicted_value: predictedValue,
            last_scored_at: new Date().toISOString(),
          },
          { onConflict: "lead_id" },
        );

      if (!error) scored++;
    }

    return jsonResponse({ scored, total: leads.length, predicted_pipeline_value: predictedPipelineValue });
  } catch (error) {
    console.error("Score leads error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});