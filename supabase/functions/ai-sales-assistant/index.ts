import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { deal, notes, action, prompt } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "You are an AI sales assistant. Be concise and actionable.";
    let userPrompt = "";

    if (prompt && !action) {
      userPrompt = prompt;
    } else if (action === "suggest_followup") {
      systemPrompt += " Generate a professional follow-up message for this deal.";
      userPrompt = `Deal: ${deal.title}\nContact: ${deal.contact_name || "Unknown"}\nSource: ${deal.source_channel}\nValue: ${deal.deal_value} ${deal.currency}\nNotes: ${(notes || []).map((n: any) => n.content).join("\n")}`;
    } else if (action === "summarize") {
      systemPrompt += " Summarize this deal's status and recommend next steps.";
      userPrompt = `Deal: ${deal.title}\nContact: ${deal.contact_name || "Unknown"}\nPriority: ${deal.priority}\nValue: ${deal.deal_value} ${deal.currency}\nCreated: ${deal.created_at}\nNotes:\n${(notes || []).map((n: any) => `- ${n.content}`).join("\n")}`;
    } else if (action === "recommend") {
      systemPrompt += " Analyze this deal and provide 3 specific actionable recommendations to improve conversion probability.";
      userPrompt = `Deal: ${deal.title}\nContact: ${deal.contact_name}\nValue: ${deal.deal_value} ${deal.currency}\nPriority: ${deal.priority}\nExpected close: ${deal.expected_close_date || "Not set"}\nNotes:\n${(notes || []).map((n: any) => `- ${n.content}`).join("\n")}`;
    } else {
      throw new Error("Unknown action: " + action);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No response generated.";

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[AI-SALES-ASSISTANT]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
