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
    const body = await req.json();
    const {
      user_id,
      from_email,
      from_name,
      subject,
      body_text,
      received_at,
      channel_id,
    } = body;

    if (!user_id || !body_text) {
      return new Response(JSON.stringify({ error: "user_id and body_text are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageContent = subject ? `[${subject}] ${body_text}` : body_text;
    const timestamp = received_at || new Date().toISOString();

    // Keyword matching
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", user_id)
      .eq("is_active", true);

    const textLower = messageContent.toLowerCase();
    const matched = (keywords || [])
      .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
      .map((k: any) => k.keyword);

    const intentScore = matched.length > 0 ? 0.5 : 0.1;
    const priority = matched.length > 0 ? "medium" : "normal";

    // AI analysis for matched messages
    let aiScore = intentScore;
    let suggestedReply = "";
    if (matched.length > 0) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        try {
          const { data: profile } = await supabase
            .from("business_profiles")
            .select("*")
            .eq("user_id", user_id)
            .maybeSingle();

          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                  content: `Analyze email buying intent for keywords: ${matched.join(", ")}. Business: ${profile?.business_name || "Unknown"}. Respond with JSON: {"intent_score": number, "suggested_reply": string, "is_lead": boolean}`,
                },
                { role: "user", content: messageContent },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "analyze_lead",
                  description: "Return analysis",
                  parameters: {
                    type: "object",
                    properties: {
                      intent_score: { type: "number" },
                      suggested_reply: { type: "string" },
                      is_lead: { type: "boolean" },
                    },
                    required: ["intent_score", "suggested_reply", "is_lead"],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "analyze_lead" } },
            }),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
            if (tc) {
              const parsed = JSON.parse(tc.function.arguments);
              aiScore = parsed.intent_score;
              suggestedReply = parsed.suggested_reply;
            }
          }
        } catch (e) {
          console.error("AI analysis error:", e);
        }
      }
    }

    // Create inbox message
    const { error: inboxErr } = await supabase.from("inbox_messages").insert({
      user_id,
      channel_id: channel_id || null,
      channel_type: "email",
      source_name: from_email || "Email",
      sender_name: from_name || from_email || "Unknown",
      sender_identifier: from_email || "",
      message_content: messageContent,
      message_timestamp: timestamp,
      intent_score: aiScore,
      matched_keywords: matched,
      is_unread: true,
      priority: aiScore >= 0.7 ? "high" : priority,
      status: "new",
    });

    if (inboxErr) console.error("Inbox insert error:", inboxErr);

    // Create lead if matched
    let leadId = null;
    if (matched.length > 0 && aiScore >= 0.3) {
      const { data: lead } = await supabase
        .from("leads")
        .insert({
          user_id,
          message_content: messageContent,
          source_name: from_email || "Email",
          source_type: "email",
          message_date: timestamp,
          detected_keyword: matched[0],
          intent_score: aiScore,
          suggested_reply: suggestedReply,
          status: "new",
        })
        .select("id")
        .single();
      leadId = lead?.id;
    }

    return new Response(JSON.stringify({ ok: true, matched: matched.length, lead_id: leadId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("email-ingest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
