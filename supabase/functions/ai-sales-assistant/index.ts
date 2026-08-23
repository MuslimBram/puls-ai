import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { routerChatCompletion } from "../_shared/router-chat-compat.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const { deal, notes, action, prompt } = await req.json();
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

    const response = await routerChatCompletion({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }, { authHeader: req.headers.get("Authorization"), taskType: "sales_reply" });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402, headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No response generated.";

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[AI-SALES-ASSISTANT]", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
