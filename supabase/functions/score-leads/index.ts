import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { workspace_id, action } = await req.json();
    if (!workspace_id) throw new Error("workspace_id required");

    // Get all leads for the workspace
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, user_id, sender_name, message_content, message_date, channel_type, status, detected_keyword, intent_score, workspace_id")
      .eq("workspace_id", workspace_id)
      .order("message_date", { ascending: false })
      .limit(100);

    if (leadsErr) throw leadsErr;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ scored: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing conversation memory for context
    const { data: memories } = await supabase
      .from("ai_conversation_memory")
      .select("contact_identifier, summary, key_facts, interaction_count")
      .eq("workspace_id", workspace_id)
      .limit(200);

    const memoryMap = new Map((memories || []).map(m => [m.contact_identifier, m]));

    // Build scoring prompt
    const leadSummaries = leads.slice(0, 50).map(l => ({
      id: l.id,
      name: l.sender_name,
      message: (l.message_content || "").slice(0, 200),
      channel: l.channel_type,
      keyword: l.detected_keyword,
      intent: l.intent_score,
      date: l.message_date,
      interactions: memoryMap.get(l.sender_name || "")?.interaction_count || 0,
    }));

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a lead scoring AI. Score each lead from 0-100 based on:
- Message intent and urgency (high-intent words = higher score)
- Channel type (direct message = higher than comment)
- Keyword relevance
- Interaction history count
- Recency

Also estimate churn_risk (0-100) for existing contacts based on:
- Time since last interaction
- Sentiment of messages
- Engagement pattern

Return JSON array: [{"id":"lead-uuid","score":85,"churn_risk":10,"factors":{"intent":30,"recency":25,"channel":15,"engagement":15}}]
Only return valid JSON array, no markdown.`,
          },
          {
            role: "user",
            content: JSON.stringify(leadSummaries),
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) throw new Error(`AI gateway error: ${aiResponse.status}`);
    
    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    let scores;
    try {
      scores = JSON.parse(content.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    } catch {
      console.error("Failed to parse AI scores:", content);
      scores = [];
    }

    // Upsert scores
    let scored = 0;
    for (const s of scores) {
      if (!s.id || typeof s.score !== "number") continue;
      
      const { error } = await supabase
        .from("lead_scores")
        .upsert({
          lead_id: s.id,
          workspace_id,
          score: Math.min(100, Math.max(0, s.score)),
          score_factors: s.factors || {},
          churn_risk: Math.min(100, Math.max(0, s.churn_risk || 0)),
          churn_factors: s.churn_factors || {},
          last_scored_at: new Date().toISOString(),
        }, { onConflict: "lead_id" });

      if (!error) scored++;
    }

    return new Response(JSON.stringify({ scored, total: leads.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Score leads error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
