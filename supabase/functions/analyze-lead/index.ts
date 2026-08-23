import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { routerChatCompletion } from "../_shared/router-chat-compat.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const { message, keywords, businessProfile } = await req.json();
    const systemPrompt = `You are a lead analysis AI. Analyze the following message from a Telegram group/channel.
Determine:
1. Whether it contains buying intent related to: ${keywords.join(", ")}
2. The intent score (0.0 to 1.0) where 1.0 is highest buying intent
3. Which keyword was detected (if any)
4. A suggested professional reply the business could send
5. The intent type: curiosity, research, comparison, ready_to_buy, complaint, or unknown
6. The urgency level: low, medium, or high
7. The recommended action: ignore, monitor, engage_soft, or engage_direct

Business context:
- Name: ${businessProfile?.business_name || "Unknown"}
- Industry: ${businessProfile?.industry || "General"}
- Services: ${businessProfile?.main_services || "Various"}
- Tone: ${businessProfile?.ai_tone || "professional"}
- Language: ${businessProfile?.language || "en"}`;

    const response = await routerChatCompletion({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this message: "${message}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_lead",
              description: "Return the lead analysis results",
              parameters: {
                type: "object",
                properties: {
                  intent_score: { type: "number", description: "0.0 to 1.0 buying intent score" },
                  detected_keyword: { type: "string", description: "The matched keyword or empty string" },
                  suggested_reply: { type: "string", description: "A professional reply suggestion" },
                  is_lead: { type: "boolean", description: "Whether this is a genuine lead" },
                  intent_type: { type: "string", enum: ["curiosity", "research", "comparison", "ready_to_buy", "complaint", "unknown"], description: "Type of intent detected" },
                  urgency_level: { type: "string", enum: ["low", "medium", "high"], description: "How urgent the lead's need appears" },
                  recommended_action: { type: "string", enum: ["ignore", "monitor", "engage_soft", "engage_direct"], description: "Recommended follow-up action" },
                },
                required: ["intent_score", "detected_keyword", "suggested_reply", "is_lead", "intent_type", "urgency_level", "recommended_action"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_lead" } },
      }, { authHeader: req.headers.get("Authorization"), taskType: "sales_reply", allowInternalNoWorkspace: !req.headers.get("Authorization") });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits required. Please add funds." }), {
          status: 402, headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = toolCall ? JSON.parse(toolCall.function.arguments) : { intent_score: 0, detected_keyword: "", suggested_reply: "", is_lead: false };

    return new Response(JSON.stringify(result), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-lead error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
