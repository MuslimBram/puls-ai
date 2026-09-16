import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { routerChatCompletion } from "../_shared/router-chat-compat.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { staffRolesOf } from "../_shared/platform-roles.ts";
import { resolveAiReplyLimit, resolvePlanKey } from "../_shared/plan-limits.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, business_id, workspace_id, visitor_name, visitor_email, message, page_url, channel_type } = await req.json();
    if (!user_id || !message) {
      return new Response(JSON.stringify({ error: "user_id and message are required" }), {
        status: 400, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    if (message.length > 5000) {
      return new Response(JSON.stringify({ error: "Message too long (max 5000 chars)" }), {
        status: 400, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = getServiceKey()!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_suspended")
      .eq("user_id", user_id)
      .maybeSingle();

    if (profile?.is_suspended) {
      return new Response(JSON.stringify({ error: "Account suspended" }), {
        status: 403, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const [{ data: sub }, { data: roleRows }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan, ai_replies_today, ai_replies_reset_at, subscription_status, grace_period_end, trial_end")
        .eq("user_id", user_id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user_id),
    ]);

    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    // FAZA 1A: platform staff only. `business_owner` is held by every user.
    const hasPrivilegedBypass = staffRolesOf(roles).length > 0;

    // FAZA 1A: plan and limit come from pricing_settings, not a local table.
    const plan = hasPrivilegedBypass ? "enterprise" : resolvePlanKey(sub);
    const limit = hasPrivilegedBypass ? -1 : await resolveAiReplyLimit(supabase, plan);

    const resetAt = sub?.ai_replies_reset_at ? new Date(sub.ai_replies_reset_at) : new Date(0);
    const now = new Date();
    const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);
    const currentUsed = hoursSinceReset >= 24 ? 0 : (sub?.ai_replies_today || 0);

    /**
     * FAZA 1A — why the allowance ran out, not whether it did.
     *
     * A cancelled or unpaid subscription is already downgraded to the lowest
     * plan by `resolvePlanKey`, so `limit` above IS the standard limit and the
     * generic check below would refuse this caller anyway. This branch changes
     * only the message: "renew", not "upgrade". It therefore has to run FIRST.
     *
     * It used to compare against a hard-coded `PLAN_LIMITS.standard` of 20.
     * That table went with the rest of the 20/100/500 ladder and this one
     * reference was left behind — an identifier that no longer existed, which
     * would have thrown a ReferenceError and answered 500 to exactly the
     * customers the branch exists to help. Nothing caught it: tsconfig.app.json
     * covers only ./src, no test imports an entrypoint, and the bundler does
     * not typecheck. `faza1aEdgeFunctionNames.test.ts` now does.
     */
    const subStatus = sub?.subscription_status || "active";
    if (!hasPrivilegedBypass && ["canceled", "unpaid"].includes(subStatus) && limit !== -1 && currentUsed >= limit) {
      return new Response(JSON.stringify({
        error: "Your subscription has expired. Please renew to continue using AI replies.",
        limit_reached: true,
      }), { status: 403, headers: { ...getCors(req), "Content-Type": "application/json" } });
    }

    if (limit !== -1 && currentUsed >= limit) {
      return new Response(JSON.stringify({
        error: `Daily AI reply limit reached (${currentUsed}/${limit}). Upgrade your plan for more AI replies.`,
        limit_reached: true,
      }), { status: 429, headers: { ...getCors(req), "Content-Type": "application/json" } });
    }

    let businessQuery = supabase
      .from("business_profiles")
      .select("id, user_id, workspace_id, business_name, industry, main_services, short_description, target_audience, mission_values, ai_tone, language")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true })
      .limit(2);

    if (workspace_id) businessQuery = businessQuery.eq("workspace_id", workspace_id);
    if (business_id) businessQuery = businessQuery.eq("id", business_id);

    const { data: businesses, error: businessError } = await businessQuery;
    if (businessError) throw businessError;

    if (!businesses || businesses.length === 0) {
      throw new Error("No matching business context found");
    }

    if (!business_id && businesses.length > 1) {
      throw new Error("business_id is required when multiple businesses exist in this workspace");
    }

    const bizProfile = businesses[0];

    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", user_id)
      .eq("is_active", true);

    const keywordList = (keywords ?? []).map((k: { keyword: string }) => k.keyword);

    let knowledgeContext = "";
    try {
      const { data: kbChunks } = await supabase
        .from("knowledge_chunks")
        .select("content, topic_tags, content_type")
        .eq("user_id", user_id)
        .eq("business_id", bizProfile.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (kbChunks && kbChunks.length > 0) {
        const relevantChunks = kbChunks
          .filter((c: { topic_tags: string[] | null; content: string; content_type: string }) => {
            const msgLower = message.toLowerCase();
            return c.topic_tags?.some((t: string) => msgLower.includes(t.toLowerCase())) ||
              c.content.toLowerCase().split(/\s+/).some((w: string) => msgLower.includes(w) && w.length > 4);
          })
          .slice(0, 5);

        if (relevantChunks.length > 0) {
          knowledgeContext = "\n\nRelevant Knowledge Base:\n" +
            relevantChunks.map((c: { content_type: string; content: string }) => `[${c.content_type}] ${c.content.slice(0, 500)}`).join("\n---\n");
        } else {
          knowledgeContext = "\n\nBusiness Knowledge:\n" +
            kbChunks.slice(0, 3).map((c: { content: string }) => c.content.slice(0, 300)).join("\n---\n");
        }
      }
    } catch (e) {
      console.error("KB context fetch error:", e);
    }

    const simplePatterns = [
      /^(hi|hello|hey|merhaba|përshëndetje|çfarë bëni|what do you do|pricing|price|cost|hours|location|address|contact|phone|email)/i,
      /^.{0,60}$/,
    ];
    const isSimple = simplePatterns.some((p) => p.test(message.trim()));
    const complexity = isSimple ? "simple" : "complex";

    const businessContext = `Business: ${bizProfile.business_name}\nIndustry: ${bizProfile.industry || "General"}\nServices: ${bizProfile.main_services || "Various services"}\nDescription: ${bizProfile.short_description || ""}\nTarget Audience: ${bizProfile.target_audience || "General"}\nMission: ${bizProfile.mission_values || ""}\nTone: ${bizProfile.ai_tone || "professional"}\nLanguage: ${bizProfile.language || "en"}`;

    const systemPrompt = `You are a Dedicated AI Assistant for a business. You respond to visitor inquiries based only on the selected business below.\n\nBusiness ID: ${bizProfile.id}\n${businessContext}${knowledgeContext}\n\nKeywords the business monitors: ${keywordList.join(", ") || "none"}\n\nRules:\n- Always respond in the language the visitor writes in\n- Use only this business context and never mix in another business\n- Be helpful and knowledgeable about the business's products/services\n- Use the knowledge base information when relevant to provide detailed, accurate answers\n- Present yourself as the business's dedicated AI assistant\n- For simple questions, provide a direct and helpful answer\n- For complex questions, provide an initial helpful response but mention that a team member will follow up\n- Always include a call-to-action\n- Keep responses concise (2-5 sentences)\n- Never make up specific prices, dates, or promises not mentioned in the business profile or knowledge base`;

    const aiResponse = await routerChatCompletion({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }, { workspaceId: bizProfile.workspace_id, userId: user_id, taskType: "sales_reply" });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits required." }), {
          status: 402, headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      throw new Error("AI reply generation failed");
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "Thank you for your message. A team member will get back to you shortly.";
    const isAutoReply = complexity === "simple";

    if (hoursSinceReset >= 24) {
      await supabase.from("subscriptions").update({
        ai_replies_today: 1, ai_replies_reset_at: now.toISOString(),
      }).eq("user_id", user_id);
    } else {
      await supabase.from("subscriptions").update({
        ai_replies_today: currentUsed + 1,
      }).eq("user_id", user_id);
    }

    const { data: conversation, error: convError } = await supabase.from("ai_conversations").insert({
      user_id,
      workspace_id: bizProfile.workspace_id,
      business_id: bizProfile.id,
      channel_type: channel_type || "website_chat",
      visitor_name: visitor_name || null,
      visitor_email: visitor_email || null,
      visitor_message: message,
      ai_reply: reply,
      is_auto_reply: isAutoReply,
      is_draft: !isAutoReply,
      complexity,
      status: isAutoReply ? "sent" : "draft",
      page_url: page_url || null,
    }).select().single();

    if (convError) console.error("Error saving conversation:", convError);

    const matchedKws = keywordList.filter((kw: string) => message.toLowerCase().includes(kw.toLowerCase()));

    await supabase.from("inbox_messages").insert({
      user_id,
      workspace_id: bizProfile.workspace_id,
      channel_type: channel_type || "website_chat",
      source_name: visitor_name || "AI Chat Visitor",
      sender_name: visitor_name || "Visitor",
      sender_identifier: visitor_email || null,
      message_content: message,
      matched_keywords: matchedKws,
      priority: matchedKws.length > 0 ? "medium" : "normal",
      metadata: {
        business_id: bizProfile.id,
        ai_conversation_id: conversation?.id,
        ai_auto_replied: isAutoReply,
      },
    });

    return new Response(JSON.stringify({
      reply,
      conversation_id: conversation?.id,
      business_id: bizProfile.id,
      is_auto_reply: isAutoReply,
      complexity,
      ai_replies_used: currentUsed + 1,
      ai_replies_limit: limit,
    }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dedicated-ai-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
