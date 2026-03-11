import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, visitor_name, visitor_email, message, page_url, channel_type } = await req.json();
    if (!user_id || !message) {
      return new Response(JSON.stringify({ error: "user_id and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch business profile for context
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    // Fetch keywords for context
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", user_id)
      .eq("is_active", true);

    const keywordList = (keywords ?? []).map((k: any) => k.keyword);

    // Determine complexity
    const simplePatterns = [
      /^(hi|hello|hey|merhaba|përshëndetje|çfarë bëni|what do you do|pricing|price|cost|hours|location|address|contact|phone|email)/i,
      /^.{0,60}$/,
    ];
    const isSimple = simplePatterns.some((p) => p.test(message.trim()));
    const complexity = isSimple ? "simple" : "complex";

    // Build system prompt with business context
    const businessContext = profile
      ? `Business: ${profile.business_name}
Industry: ${profile.industry || "General"}
Services: ${profile.main_services || "Various services"}
Description: ${profile.short_description || ""}
Target Audience: ${profile.target_audience || "General"}
Mission: ${profile.mission_values || ""}
Tone: ${profile.ai_tone || "professional"}
Language: ${profile.language || "en"}`
      : "No business profile available.";

    const systemPrompt = `You are a Dedicated AI Assistant for a business. You respond to visitor inquiries based on the business information provided below.

${businessContext}

Keywords the business monitors: ${keywordList.join(", ") || "none"}

Rules:
- Always respond in the language the visitor writes in
- Be helpful, knowledgeable about the business's products/services
- Present yourself as the business's dedicated AI assistant
- For simple questions (greetings, pricing, hours, services), provide a direct and helpful answer
- For complex questions (custom projects, complaints, technical issues), provide an initial helpful response but mention that a team member will follow up
- Always include a call-to-action
- Keep responses concise (2-5 sentences)
- Never make up specific prices, dates, or promises not mentioned in the business profile`;

    // Call AI
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
          { role: "user", content: message },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI reply generation failed");
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "Thank you for your message. A team member will get back to you shortly.";

    const isAutoReply = complexity === "simple";

    // Save conversation
    const { data: conversation, error: convError } = await supabase.from("ai_conversations").insert({
      user_id,
      channel_type: channel_type || "website_chat",
      visitor_name: visitor_name || null,
      visitor_email: visitor_email || null,
      visitor_message: message,
      ai_reply: reply,
      is_auto_reply: isAutoReply,
      is_draft: !isAutoReply,
      complexity,
      status: isAutoReply ? "sent" : "draft",
      page_url: page_url || null,
    }).select().single();

    if (convError) console.error("Error saving conversation:", convError);

    // Also create inbox message + lead if keywords match
    const matchedKws = keywordList.filter((kw: string) =>
      message.toLowerCase().includes(kw.toLowerCase())
    );

    if (matchedKws.length > 0 || true) {
      // Always create inbox message for tracking
      await supabase.from("inbox_messages").insert({
        user_id,
        channel_type: channel_type || "website_chat",
        source_name: visitor_name || "AI Chat Visitor",
        sender_name: visitor_name || "Visitor",
        sender_identifier: visitor_email || null,
        message_content: message,
        matched_keywords: matchedKws,
        priority: matchedKws.length > 0 ? "medium" : "normal",
        metadata: { ai_conversation_id: conversation?.id, ai_auto_replied: isAutoReply },
      });
    }

    return new Response(JSON.stringify({
      reply,
      conversation_id: conversation?.id,
      is_auto_reply: isAutoReply,
      complexity,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dedicated-ai-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
