import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, senderName, channelType, keywords, tone, businessProfile, template } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let templateInstruction = "";
    if (template) {
      templateInstruction = `\nUse this template as a base, filling in placeholders:\n${template}`;
    }

    const systemPrompt = `You are a business communication AI assistant.
Generate a reply to a potential lead message.

Tone: ${tone || "professional"}
Business: ${businessProfile?.business_name || "Our Company"}
Industry: ${businessProfile?.industry || "General"}
Services: ${businessProfile?.main_services || "Various services"}
Language: ${businessProfile?.language || "en"}
Channel: ${channelType || "messaging"}
Sender: ${senderName || "potential customer"}
Matched keywords: ${keywords?.join(", ") || "none"}
${templateInstruction}

Write a natural, helpful reply that:
- Addresses the sender's needs based on their message
- Highlights relevant services
- Includes a clear call-to-action
- Matches the requested tone
- Is appropriate for the channel type
- Is concise (2-4 sentences max)`;

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
          { role: "user", content: `Generate a reply to this message: "${message}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_reply",
              description: "Return the generated reply",
              parameters: {
                type: "object",
                properties: {
                  reply: { type: "string", description: "The generated reply text" },
                },
                required: ["reply"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_reply" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI reply generation failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = toolCall
      ? JSON.parse(toolCall.function.arguments)
      : { reply: "Thank you for your interest. We'd love to help. Please reach out to us directly for more details." };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
