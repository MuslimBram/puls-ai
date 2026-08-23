import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { routerChatCompletion } from "../_shared/router-chat-compat.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

// Each focus category maps to ONE canonical action_type written to
// ai_suggested_actions. The frontend (/ai-decisions?focus=...) filters by
// exact match on this value, so suggestions never leak across tabs.
type Focus = "posts" | "offers" | "replies" | "campaigns" | "seo" | "competitors";

const ACTION_TYPE: Record<Focus, string> = {
  posts: "suggest_post",
  offers: "suggest_offer",
  replies: "suggest_reply",
  campaigns: "suggest_campaign",
  seo: "seo_opportunity",
  competitors: "competitor_insight",
};

const PROMPT_BY_FOCUS: Record<Focus, (ctx: Record<string, unknown>) => string> = {
  posts: (ctx) => `You are a social media strategist for a SaaS business communication platform.
Business context: ${JSON.stringify(ctx)}
Suggest 3 specific social media posts the business should publish next. For each, return:
- title: short post headline (max 8 words)
- description: 1-2 sentence draft of the post copy
- impact_estimate: one of "Low", "Medium", "High"
- confidence: integer 0-100
Return ONLY a JSON array of objects with keys: title, description, impact_estimate, confidence.`,

  offers: (ctx) => `You are a pricing/promotions strategist for a SaaS business.
Business context: ${JSON.stringify(ctx)}
Suggest 3 specific pricing, bundle, or promotional offers worth running. For each, return:
- title: short offer name
- description: 1-2 sentences explaining the offer and why it fits the signals
- impact_estimate: one of "Low", "Medium", "High"
- confidence: integer 0-100
Return ONLY a JSON array of objects with keys: title, description, impact_estimate, confidence.`,

  replies: (ctx) => `You are a customer support/sales assistant for a SaaS business.
Recent unanswered or stale conversations: ${JSON.stringify(ctx)}
Draft 3 specific reply suggestions for the conversations that need a response. For each, return:
- title: short label naming who/what the reply addresses
- description: the actual drafted reply text (2-4 sentences)
- impact_estimate: one of "Low", "Medium", "High"
- confidence: integer 0-100
Return ONLY a JSON array of objects with keys: title, description, impact_estimate, confidence.`,

  campaigns: (ctx) => `You are a campaign strategist for a SaaS business communication platform.
Business context: ${JSON.stringify(ctx)}
Suggest 3 specific broadcast/outreach campaigns worth running next. For each, return:
- title: short campaign name
- description: 1-2 sentences on the campaign's goal, audience, and channel
- impact_estimate: one of "Low", "Medium", "High"
- confidence: integer 0-100
Return ONLY a JSON array of objects with keys: title, description, impact_estimate, confidence.`,

  seo: (ctx) => `You are an SEO strategist analyzing a business website.
Business context: ${JSON.stringify(ctx)}
Suggest 3 specific SEO opportunities (keyword gaps, ranking issues, content gaps). For each, return:
- title: short opportunity name
- description: 1-2 sentences explaining the gap and the recommended fix
- impact_estimate: one of "Low", "Medium", "High"
- confidence: integer 0-100
Return ONLY a JSON array of objects with keys: title, description, impact_estimate, confidence.`,

  competitors: (ctx) => `You are a competitive intelligence analyst.
Business context and known competitor signals: ${JSON.stringify(ctx)}
Suggest 3 specific competitive plays the business should consider, inspired by what competitors are doing. For each, return:
- title: short play name
- description: 1-2 sentences explaining the play and the competitor signal behind it
- impact_estimate: one of "Low", "Medium", "High"
- confidence: integer 0-100
Return ONLY a JSON array of objects with keys: title, description, impact_estimate, confidence.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const { user_id, workspace_id, focus } = await req.json();
    if (!user_id) throw new Error("user_id required");
    if (!focus || !(focus in ACTION_TYPE)) {
      throw new Error(`focus must be one of: ${Object.keys(ACTION_TYPE).join(", ")}`);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = getServiceKey()!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Light context pull — kept intentionally small per-focus so each
    // category gets relevant signals without an expensive full scan.
    const ctx: Record<string, unknown> = {};

    const { data: bizProfile } = await sb
      .from("business_profiles")
      .select("business_name, industry, short_description, target_audience, main_services, workspace_id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (bizProfile) ctx.business = bizProfile;

    if (focus === "replies") {
      const { data: staleThreads } = await sb
        .from("inbox_messages")
        .select("id, sender_name, message_preview, created_at")
        .eq("user_id", user_id)
        .is("first_response_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      ctx.stale_conversations = staleThreads || [];
    }

    if (focus === "competitors") {
      const { data: alerts } = await sb
        .from("competitor_alerts")
        .select("competitor_name, alert_type, details, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(5);
      ctx.competitor_alerts = alerts || [];
    }

    if (focus === "seo") {
      const { data: scanRows } = await sb
        .from("business_scans")
        .select("scan_type, findings, created_at")
        .eq("user_id", user_id)
        .eq("scan_type", "seo")
        .order("created_at", { ascending: false })
        .limit(3);
      ctx.seo_scans = scanRows || [];
    }

    const prompt = PROMPT_BY_FOCUS[focus as Focus](ctx);

    const aiResp = await routerChatCompletion({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }, { workspaceId: workspace_id || bizProfile?.workspace_id || undefined, userId: user_id, authHeader: req.headers.get("Authorization"), taskType: focus === "replies" ? "sales_reply" : focus === "seo" ? "web_research" : "marketing_copy" });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`AI gateway error: ${aiResp.status} ${errText}`);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";

    let suggestions: Array<{ title: string; description: string; impact_estimate: string; confidence: number }> = [];
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      throw new Error("Could not parse AI response as JSON");
    }

    const actionType = ACTION_TYPE[focus as Focus];
    const rows = suggestions.slice(0, 5).map((s) => ({
      workspace_id: workspace_id || null,
      user_id,
      action_type: actionType,
      title: s.title?.slice(0, 200) || "Untitled suggestion",
      description: s.description || "",
      confidence: Number.isFinite(s.confidence) ? Math.max(0, Math.min(100, s.confidence)) : 60,
      impact_estimate: s.impact_estimate || "Medium",
      status: "pending",
      source_signal: `generate-ai-suggestions:${focus}`,
      action_payload: { focus },
    }));

    if (rows.length > 0) {
      const { error: insertError } = await sb.from("ai_suggested_actions").insert(rows);
      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({ inserted: rows.length, focus, action_type: actionType }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-ai-suggestions error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
