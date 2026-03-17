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

    const { workspace_id, contact_identifier, new_message, channel_type } = await req.json();
    if (!workspace_id || !contact_identifier) throw new Error("workspace_id and contact_identifier required");

    // Get existing memory for this contact
    const { data: existing } = await supabase
      .from("ai_conversation_memory")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("contact_identifier", contact_identifier)
      .eq("memory_type", "conversation")
      .maybeSingle();

    // Get recent conversation history
    const { data: recentMessages } = await supabase
      .from("inbox_messages")
      .select("message_content, sender_name, message_timestamp, channel_type, direction")
      .eq("workspace_id", workspace_id)
      .or(`sender_name.eq.${contact_identifier},sender_identifier.eq.${contact_identifier}`)
      .order("message_timestamp", { ascending: false })
      .limit(20);

    // Get business profile for context
    const { data: bizProfile } = await supabase
      .from("business_profiles")
      .select("business_name, main_services, target_audience, ai_tone")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    // Get deal context if any
    const { data: deals } = await supabase
      .from("deals")
      .select("title, stage_id, value, contact_name")
      .eq("workspace_id", workspace_id)
      .ilike("contact_name", `%${contact_identifier}%`)
      .limit(3);

    const conversationHistory = (recentMessages || []).map(m => 
      `[${m.direction || 'in'}] ${m.sender_name}: ${(m.message_content || '').slice(0, 300)}`
    ).join("\n");

    const previousSummary = existing?.summary || "No previous interactions recorded.";
    const previousFacts = existing?.key_facts || [];

    // Build AI prompt for memory update + reply suggestion
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
            content: `You are an AI conversation memory manager for "${bizProfile?.business_name || 'a business'}".
Services: ${bizProfile?.main_services || 'N/A'}
Tone: ${bizProfile?.ai_tone || 'professional'}
${deals?.length ? `Active deals: ${deals.map(d => `${d.title} (${d.value})`).join(', ')}` : ''}

Previous memory summary: ${previousSummary}
Previous key facts: ${JSON.stringify(previousFacts)}

Analyze the conversation and return JSON:
{
  "updated_summary": "Brief summary of relationship and conversation history (max 200 words)",
  "key_facts": ["fact1", "fact2", ...],
  "sentiment_trend": "positive|neutral|negative|mixed",
  "suggested_reply": "A suggested reply for the latest message considering full context",
  "deal_suggestion": "Brief suggestion about deal progress or opportunity, or null"
}
Only return valid JSON.`,
          },
          {
            role: "user",
            content: `Recent conversation:\n${conversationHistory}\n\n${new_message ? `New message from contact: ${new_message}` : "Update memory from recent history."}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) throw new Error(`AI gateway error: ${aiResponse.status}`);

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    } catch {
      parsed = { updated_summary: content, key_facts: [], sentiment_trend: "neutral", suggested_reply: "" };
    }

    // Upsert conversation memory
    const memoryData = {
      workspace_id,
      contact_identifier,
      contact_name: contact_identifier,
      memory_type: "conversation" as const,
      summary: parsed.updated_summary || previousSummary,
      key_facts: parsed.key_facts || previousFacts,
      sentiment_trend: parsed.sentiment_trend || "neutral",
      last_interaction_at: new Date().toISOString(),
      interaction_count: (existing?.interaction_count || 0) + 1,
    };

    if (existing) {
      await supabase
        .from("ai_conversation_memory")
        .update(memoryData)
        .eq("id", existing.id);
    } else {
      await supabase
        .from("ai_conversation_memory")
        .insert(memoryData);
    }

    return new Response(JSON.stringify({
      memory: memoryData,
      suggested_reply: parsed.suggested_reply,
      deal_suggestion: parsed.deal_suggestion,
      sentiment: parsed.sentiment_trend,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI memory error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
