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

    const systemPrompt = `Ti je një asistent AI i platformës sonë. Ndihmo përdoruesit me pyetje rreth funksioneve, çmimeve, referaleve, dhe përdorimit të platformës.

Informacione kryesore:
- Planet: START (29€/muaj), GROWTH (79€/muaj), PRO (149€/muaj), ENTERPRISE (399€+/muaj)
- Zbritjet e paketave: mujore 0%, 3-mujore 5%, 6-mujore 10%, vjetore 15%
- Referale biznesi: 15% komision përjetë nga çdo pagesë e biznesit të referuar
- Referale freelancer: 20% komision përjetë
- 7 ditë provë falas

Rregulla:
- Përgjigju në shqip
- Ji i shkurtër dhe i qartë
- Nëse nuk mund ta zgjidhësh çështjen ose përdoruesi kërkon ndihmë specifike teknike, kthe needs_admin: true
- Nëse pyetja është rreth pagesave, faturave, ose problemeve teknike të llogarisë, kthe needs_admin: true`;

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
              description: "Escalate the conversation to a human admin when the AI cannot resolve the issue",
              parameters: {
                type: "object",
                properties: {
                  reason: { type: "string", description: "Why escalation is needed" },
                  reply: { type: "string", description: "Final reply to user before escalation" },
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
          reply = args.reply || "Do t'ju lidhim me një administrator.";
          needs_admin = true;
        } catch {
          reply = "Do t'ju lidhim me një administrator.";
          needs_admin = true;
        }
      }
    } else {
      reply = choice?.message?.content || "Nuk munda të gjej një përgjigje.";
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
