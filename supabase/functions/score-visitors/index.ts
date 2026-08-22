import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const jsonResponse = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

async function resolveAuthorizedWorkspaceId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  requestedWorkspaceId?: string,
): Promise<string> {
  const adminResult = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (adminResult.error) throw adminResult.error;
  const isAdmin = Boolean(adminResult.data);

  if (requestedWorkspaceId) {
    const [memberResult, ownerResult] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: userId, _workspace_id: requestedWorkspaceId }),
      supabase.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: requestedWorkspaceId }),
    ]);

    if (memberResult.error) throw memberResult.error;
    if (ownerResult.error) throw ownerResult.error;

    if (!memberResult.data && !ownerResult.data && !isAdmin) {
      throw new Error("FORBIDDEN_WORKSPACE");
    }

    return requestedWorkspaceId;
  }

  const [ownedResult, memberResult] = await Promise.all([
    supabase.from("workspaces").select("id").eq("owner_id", userId),
    supabase.from("workspace_members").select("workspace_id").eq("user_id", userId),
  ]);

  if (ownedResult.error) throw ownedResult.error;
  if (memberResult.error) throw memberResult.error;

  const candidates = new Set<string>();
  for (const row of ownedResult.data || []) candidates.add(row.id);
  for (const row of memberResult.data || []) if (row.workspace_id) candidates.add(row.workspace_id);

  if (candidates.size === 0) throw new Error("NO_WORKSPACE");
  if (candidates.size > 1) throw new Error("WORKSPACE_REQUIRED");

  return [...candidates][0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = getServiceKey()!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const requestedWorkspaceId = typeof body?.workspace_id === "string" ? body.workspace_id : undefined;

    let workspaceId: string;
    try {
      workspaceId = await resolveAuthorizedWorkspaceId(supabase, user.id, requestedWorkspaceId);
    } catch (err) {
      const code = err instanceof Error ? err.message : "WORKSPACE_REQUIRED";
      if (code === "FORBIDDEN_WORKSPACE") return jsonResponse(req, { error: "Forbidden" }, 403);
      if (code === "NO_WORKSPACE") return jsonResponse(req, { error: "No workspace available" }, 403);
      if (code === "WORKSPACE_REQUIRED") {
        return jsonResponse(req, { error: "workspace_id required when multiple workspaces are available" }, 400);
      }
      throw err;
    }

    const { data: conversations } = await supabase
      .from("ai_conversations")
      .select("visitor_email, visitor_name, visitor_message, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(500);

    const { data: inboxMessages } = await supabase
      .from("inbox_messages")
      .select("sender_identifier, sender_name, message_content, created_at")
      .eq("workspace_id", workspaceId)
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
        name: null,
        email: null,
        visits: 0,
        conversations: 0,
        lastVisit: conv.created_at,
        firstSeen: conv.created_at,
        messages: [],
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
        name: null,
        email: null,
        visits: 0,
        conversations: 0,
        lastVisit: msg.created_at,
        firstSeen: msg.created_at,
        messages: [],
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

      let aiClassification = classification;
      if (data.messages.length > 0) {
        const aiRaw = await callAIRouter(
          [
            {
              role: "user",
              content: `Visitor: ${data.name || identifier}\nConversations: ${data.conversations}\nVisits: ${data.visits}\nLast visit: ${data.lastVisit}\nFirst seen: ${data.firstSeen}\nRecent messages:\n${data.messages.slice(0, 5).join("\n")}`,
            },
          ],
          "You classify website visitors based on their behavior. Return JSON only: {\"classification\":\"curious_visitor|interested_lead|potential_buyer|high_value_prospect|promoter\",\"reasoning\":\"string\",\"suggested_action\":\"string\"}",
          {
            taskType: "text_classification",
            workspaceId,
            authHeader,
            maxTokens: 500,
          },
        );

        try {
          const parsed = JSON.parse(aiRaw.replace(/```json\n?/g, "").replace(/```/g, "").trim()) as Record<string, unknown>;
          aiClassification = String(parsed.classification || classification);
        } catch {
          throw new Error("INVALID_AI_RESPONSE_FORMAT");
        }
      }

      const { data: existing } = await supabase
        .from("visitor_profiles")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .eq("visitor_identifier", identifier)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("visitor_profiles")
          .update({
            workspace_id: workspaceId,
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
          user_id: user.id,
          workspace_id: workspaceId,
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
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .eq("status", "pending")
          .limit(1);

        if ((existingTask ?? []).length < 20) {
          await supabase.from("reengagement_tasks").insert({
            user_id: user.id,
            workspace_id: workspaceId,
            visitor_id: existing?.id || undefined,
            task_type: "follow_up",
            channel: data.email ? "email" : "chat",
            suggested_message: `Hi ${data.name || "there"}, we noticed you haven't visited in a while. We'd love to help you with anything you need!`,
          } as never);
        }
      }

      scored++;
    }

    return jsonResponse(req, { scored, total: visitorMap.size, workspace_id: workspaceId });
  } catch (e) {
    console.error("score-visitors error:", e);
    if (e instanceof Error && e.message.startsWith("ai-router ")) {
      const statusMatch = e.message.match(/^ai-router\s+(\d+)/);
      const status = statusMatch ? Number(statusMatch[1]) : 502;
      return jsonResponse(req, { error: e.message }, status);
    }
    if (e instanceof Error && e.message === "INVALID_AI_RESPONSE_FORMAT") {
      return jsonResponse(req, { error: "Invalid AI response format" }, 502);
    }
    return jsonResponse(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
