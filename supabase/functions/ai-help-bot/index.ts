import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, user_id } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are Pulse AI's built-in support assistant. Help users with questions about features, pricing, referrals, and platform usage.

Key information:
- Plans: START (€29/month), GROWTH (€79/month), PRO (€149/month), ENTERPRISE (€399+/month)
- Duration discounts: monthly 0%, 3-month 5%, 6-month 10%, yearly 15%
- Business referrals: 15% lifetime commission on every payment from referred businesses
- Freelancer referrals: 20% lifetime commission
- 7-day free trial
- PWA: installable on desktop, laptop, tablet, iOS and Android

Rules:
- Reply in English
- Be concise and helpful
- If you cannot resolve the issue or the user asks for specific technical help, billing, or account issues, call the escalate_to_admin tool. In your reply, tell the user to keep chatting while a specialist connects with them.
- Never show raw JSON or technical escalation data to the user`;

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
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "escalate_to_admin",
              description: "Escalate the conversation to a human specialist when the AI cannot resolve the issue",
              parameters: {
                type: "object",
                properties: {
                  reason: { type: "string", description: "Why escalation is needed" },
                  reply: { type: "string", description: "Reply to user — tell them to keep chatting while a specialist connects" },
                },
                required: ["reason", "reply"],
              },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    let reply = "";
    let needs_admin = false;

    if (choice?.message?.tool_calls?.length) {
      const toolCall = choice.message.tool_calls[0];
      if (toolCall.function?.name === "escalate_to_admin") {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          reply = args.reply || "I'm connecting you with a specialist. Please keep chatting in the meantime.";
          needs_admin = true;
        } catch {
          reply = "I'm connecting you with a specialist. Please keep chatting in the meantime.";
          needs_admin = true;
        }
      }
    } else {
      reply = choice?.message?.content || "I couldn't find an answer. Please try again.";
    }

    return new Response(JSON.stringify({ reply, needs_admin }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-help-bot error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
