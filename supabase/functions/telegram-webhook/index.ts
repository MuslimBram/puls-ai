import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const update = await req.json();

    // Extract message from Telegram update
    const msg = update.message || update.channel_post;
    if (!msg || !msg.text) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = msg.text;
    const chatTitle = msg.chat?.title || msg.chat?.username || "Unknown";
    const chatType = msg.chat?.type || "group";
    const senderName = msg.from
      ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ")
      : "Unknown";
    const senderId = msg.from?.id?.toString() || msg.chat?.id?.toString() || "";
    const messageDate = new Date((msg.date || Math.floor(Date.now() / 1000)) * 1000).toISOString();

    // Fetch all active keywords across all users
    const { data: allKeywords, error: kwError } = await supabase
      .from("keywords")
      .select("id, keyword, user_id")
      .eq("is_active", true);

    if (kwError) {
      console.error("Error fetching keywords:", kwError);
      throw kwError;
    }

    if (!allKeywords || allKeywords.length === 0) {
      return new Response(JSON.stringify({ ok: true, no_keywords: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const textLower = text.toLowerCase();
    // Group keywords by user
    const userMatches: Record<string, { keywords: string[]; userId: string }> = {};

    for (const kw of allKeywords) {
      const kwLower = kw.keyword.toLowerCase();
      // Support exact and partial matching
      if (textLower.includes(kwLower)) {
        if (!userMatches[kw.user_id]) {
          userMatches[kw.user_id] = { keywords: [], userId: kw.user_id };
        }
        userMatches[kw.user_id].keywords.push(kw.keyword);
      }
    }

    if (Object.keys(userMatches).length === 0) {
      return new Response(JSON.stringify({ ok: true, no_matches: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process each user's matches
    const results = [];
    for (const [userId, match] of Object.entries(userMatches)) {
      // Fetch business profile for AI context
      const { data: profile } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      // Call AI analysis
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      let analysis = {
        intent_score: 0.5,
        detected_keyword: match.keywords[0],
        suggested_reply: "",
        is_lead: true,
      };

      if (LOVABLE_API_KEY) {
        try {
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
                  content: `You are a lead analysis AI. Analyze buying intent for keywords: ${match.keywords.join(", ")}.
Business: ${profile?.business_name || "Unknown"}, Industry: ${profile?.industry || "General"}, Services: ${profile?.main_services || "Various"}.
Tone: ${profile?.ai_tone || "professional"}, Language: ${profile?.language || "en"}`,
                },
                { role: "user", content: `Analyze: "${text}"` },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "analyze_lead",
                    description: "Return lead analysis",
                    parameters: {
                      type: "object",
                      properties: {
                        intent_score: { type: "number" },
                        detected_keyword: { type: "string" },
                        suggested_reply: { type: "string" },
                        is_lead: { type: "boolean" },
                      },
                      required: ["intent_score", "detected_keyword", "suggested_reply", "is_lead"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "analyze_lead" } },
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
            if (toolCall) {
              analysis = JSON.parse(toolCall.function.arguments);
            }
          } else {
            const errText = await aiResponse.text();
            console.error("AI analysis failed:", aiResponse.status, errText);
          }
        } catch (aiErr) {
          console.error("AI call error:", aiErr);
        }
      }

      // Find user's telegram channel
      const { data: channel } = await supabase
        .from("channels")
        .select("id")
        .eq("user_id", userId)
        .eq("channel_type", "telegram")
        .eq("is_enabled", true)
        .maybeSingle();

      // Create lead if qualified
      if (analysis.is_lead && analysis.intent_score >= 0.3) {
        const { data: lead, error: leadErr } = await supabase
          .from("leads")
          .insert({
            user_id: userId,
            message_content: text,
            source_name: chatTitle,
            source_type: "telegram",
            message_date: messageDate,
            detected_keyword: analysis.detected_keyword || match.keywords[0],
            intent_score: analysis.intent_score,
            suggested_reply: analysis.suggested_reply,
            status: "new",
          })
          .select("id")
          .single();

        if (leadErr) {
          console.error("Lead insert error:", leadErr);
        }

        // Create inbox message linked to lead
        const { error: inboxErr } = await supabase.from("inbox_messages").insert({
          user_id: userId,
          channel_id: channel?.id || null,
          channel_type: "telegram",
          source_name: chatTitle,
          sender_name: senderName,
          sender_identifier: senderId,
          message_content: text,
          message_timestamp: messageDate,
          intent_score: analysis.intent_score,
          lead_id: lead?.id || null,
          matched_keywords: match.keywords,
          is_unread: true,
          priority: analysis.intent_score >= 0.7 ? "high" : analysis.intent_score >= 0.4 ? "medium" : "normal",
          status: "new",
        });

        if (inboxErr) console.error("Inbox insert error:", inboxErr);

        results.push({ userId, leadId: lead?.id, score: analysis.intent_score });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("telegram-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
