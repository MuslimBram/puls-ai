import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = getServiceKey()!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    const { data: conversations } = await supabase
      .from("ai_conversations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    const { data: inboxMessages } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    const visitorMap = new Map<string, {
      name: string | null;
      email: string | null;
      visits: number;
      conversations: number;
      lastVisit: string;
      firstSeen: string;
      messages: string[];
    }>();

    for (const conv of conversations ?? []) {
      const id = conv.visitor_email || conv.visitor_name || "anonymous";
      const existing = visitorMap.get(id) || {
        name: null, email: null, visits: 0, conversations: 0,
        lastVisit: conv.created_at, firstSeen: conv.created_at, messages: [],
      };
      existing.name = existing.name || conv.visitor_name;
      existing.email = existing.email || conv.visitor_email;
      existing.conversations++;
      existing.messages.push((conv.visitor_message || "").slice(0, 200));
      if (conv.created_at > existing.lastVisit) existing.lastVisit = conv.created_at;
      if (conv.created_at < existing.firstSeen) existing.firstSeen = conv.created_at;
      visitorMap.set(id, existing);
    }

    for (const msg of inboxMessages ?? []) {
      const id = msg.sender_identifier || msg.sender_name || "anonymous";
      const existing = visitorMap.get(id) || {
        name: null, email: null, visits: 0, conversations: 0,
        lastVisit: msg.created_at, firstSeen: msg.created_at, messages: [],
      };
      existing.name = existing.name || msg.sender_name;
      existing.visits++;
      existing.conversations++;
      existing.messages.push((msg.message_content || "").slice(0, 200));
      if (msg.created_at > existing.lastVisit) existing.lastVisit = msg.created_at;
      if (msg.created_at < existing.firstSeen) existing.firstSeen = msg.created_at;
      visitorMap.set(id, existing);
    }

    let scored = 0;

    for (const [identifier, data] of visitorMap) {
      if (identifier === "anonymous") continue;

      const conversationScore = Math.min(data.conversations / 10, 0.4);
      const visitScore = Math.min(data.visits / 20, 0.2);
      const recency = (Date.now() - new Date(data.lastVisit).getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = recency < 1 ? 0.3 : recency < 7 ? 0.2 : recency < 30 ? 0.1 : 0;
      const engagementScore = data.messages.length > 5 ? 0.1 : 0;
      
      const intentScore = Math.min(conversationScore + visitScore + recencyScore + engagementScore, 1);

      let classification = "curious_visitor";
      if (intentScore >= 0.8) classification = "high_value_prospect";
      else if (intentScore >= 0.6) classification = "potential_buyer";
      else if (intentScore >= 0.35) classification = "interested_lead";

      // S0-4: use canonical AI router — no direct Lovable/provider calls.
      let aiClassification = classification;
      if (data.messages.length > 0) {
        try {
          const aiRaw = await callAIRouter(
            [
              {
                role: "user",
                content: `Visitor: ${data.name || identifier}\nConversations: ${data.conversations}\nVisits: ${data.visits}\nLast visit: ${data.lastVisit}\nFirst seen: ${data.firstSeen}\nRecent messages:\n${data.messages.slice(0, 5).join("\n")}`,
              },
            ],
            `You classify website visitors based on their behavior. Analyze the messages and engagement data to determine buyer intent.\nReturn JSON only: {"classification":"curious_visitor|interested_lead|potential_buyer|high_value_prospect|promoter","reasoning":"string"}`,
            { taskType: "text_classification", userId },
          );
          const parsed = JSON.parse(aiRaw.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
          const cls = String(parsed.classification ?? "");
          const VALID = ["curious_visitor", "interested_lead", "potential_buyer", "high_value_prospect", "promoter"];
          if (VALID.includes(cls)) aiClassification = cls;
        } catch (e) {
          console.error("[score-visitors] AI classification error:", e);
        }
      }

      const { data: existing } = await supabase
        .from("visitor_profiles")
        .select("id")
        .eq("user_id", userId)
        .eq("visitor_identifier", identifier)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("visitor_profiles")
          .update({
            classification: aiClassification,
            intent_score: intentScore,
            total_visits: data.visits,
            total_conversations: data.conversations,
            last_visit_at: data.lastVisit,
            visitor_name: data.name,
            visitor_email: data.email,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("visitor_profiles").insert({
          user_id: userId,
          visitor_identifier: identifier,
          visitor_name: data.name,
          visitor_email: data.email,
          classification: aiClassification,
          intent_score: intentScore,
          total_visits: data.visits,
          total_conversations: data.conversations,
          last_visit_at: data.lastVisit,
          first_seen_at: data.firstSeen,
        });
      }

      if (recency > 7 && intentScore > 0.3) {
        const { data: existingTask } = await supabase
          .from("reengagement_tasks")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "pending")
          .limit(1);

        if ((existingTask ?? []).length < 20) {
          await supabase.from("reengagement_tasks").insert({
            user_id: userId,
            visitor_id: existing?.id || undefined,
            task_type: "follow_up",
            channel: data.email ? "email" : "chat",
            suggested_message: `Hi ${data.name || "there"}, we noticed you haven't visited in a while. We'd love to help you with anything you need!`,
          } as any);
        }
      }

      scored++;
    }

    return new Response(JSON.stringify({ scored, total: visitorMap.size }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("score-visitors error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
