import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_LIMITS: Record<string, number> = {
  standard: 20, professional: 100, advanced: 500, enterprise: -1,
};

// Simple in-memory rate limiter per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute per IP
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Rate limit check
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, visitor_name, visitor_email, message, page_url, channel_type } = await req.json();
    if (!user_id || !message) {
      return new Response(JSON.stringify({ error: "user_id and message are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate message length
    if (message.length > 5000) {
      return new Response(JSON.stringify({ error: "Message too long (max 5000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if user is suspended
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_suspended")
      .eq("user_id", user_id)
      .maybeSingle();

    if (profile?.is_suspended) {
      return new Response(JSON.stringify({ error: "Account suspended" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce AI reply daily limit
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, ai_replies_today, ai_replies_reset_at, subscription_status, grace_period_end, trial_end")
      .eq("user_id", user_id)
      .maybeSingle();

    const planMap: Record<string, string> = { free: "standard", pro: "professional" };
    const plan = planMap[sub?.plan || "standard"] || sub?.plan || "standard";
    const limit = PLAN_LIMITS[plan] ?? 20;

    const resetAt = sub?.ai_replies_reset_at ? new Date(sub.ai_replies_reset_at) : new Date(0);
    const now = new Date();
    const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);
    let currentUsed = hoursSinceReset >= 24 ? 0 : (sub?.ai_replies_today || 0);

    if (limit !== -1 && currentUsed >= limit) {
      return new Response(JSON.stringify({
        error: `Daily AI reply limit reached (${currentUsed}/${limit}). Upgrade your plan for more AI replies.`,
        limit_reached: true,
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check subscription status
    const subStatus = sub?.subscription_status || "active";
    if (["canceled", "unpaid"].includes(subStatus)) {
      if (currentUsed >= PLAN_LIMITS.standard) {
        return new Response(JSON.stringify({
          error: "Your subscription has expired. Please renew to continue using AI replies.",
          limit_reached: true,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fetch business profile
    const { data: bizProfile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    // Fetch keywords
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("user_id", user_id)
      .eq("is_active", true);

    const keywordList = (keywords ?? []).map((k: any) => k.keyword);

    const simplePatterns = [
      /^(hi|hello|hey|merhaba|përshëndetje|çfarë bëni|what do you do|pricing|price|cost|hours|location|address|contact|phone|email)/i,
      /^.{0,60}$/,
    ];
    const isSimple = simplePatterns.some((p) => p.test(message.trim()));
    const complexity = isSimple ? "simple" : "complex";

    const businessContext = bizProfile
      ? `Business: ${bizProfile.business_name}\nIndustry: ${bizProfile.industry || "General"}\nServices: ${bizProfile.main_services || "Various services"}\nDescription: ${bizProfile.short_description || ""}\nTarget Audience: ${bizProfile.target_audience || "General"}\nMission: ${bizProfile.mission_values || ""}\nTone: ${bizProfile.ai_tone || "professional"}\nLanguage: ${bizProfile.language || "en"}`
      : "No business profile available.";

    const systemPrompt = `You are a Dedicated AI Assistant for a business. You respond to visitor inquiries based on the business information provided below.\n\n${businessContext}\n\nKeywords the business monitors: ${keywordList.join(", ") || "none"}\n\nRules:\n- Always respond in the language the visitor writes in\n- Be helpful, knowledgeable about the business's products/services\n- Present yourself as the business's dedicated AI assistant\n- For simple questions, provide a direct and helpful answer\n- For complex questions, provide an initial helpful response but mention that a team member will follow up\n- Always include a call-to-action\n- Keep responses concise (2-5 sentences)\n- Never make up specific prices, dates, or promises not mentioned in the business profile`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI reply generation failed");
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "Thank you for your message. A team member will get back to you shortly.";
    const isAutoReply = complexity === "simple";

    // Increment AI reply counter
    if (hoursSinceReset >= 24) {
      await supabase.from("subscriptions").update({
        ai_replies_today: 1, ai_replies_reset_at: now.toISOString(),
      }).eq("user_id", user_id);
    } else {
      await supabase.from("subscriptions").update({
        ai_replies_today: currentUsed + 1,
      }).eq("user_id", user_id);
    }

    // Save conversation
    const { data: conversation, error: convError } = await supabase.from("ai_conversations").insert({
      user_id,
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

    // Create inbox message
    const matchedKws = keywordList.filter((kw: string) =>
      message.toLowerCase().includes(kw.toLowerCase())
    );

    await supabase.from("inbox_messages").insert({
      user_id,
      channel_type: channel_type || "website_chat",
      source_name: visitor_name || "AI Chat Visitor",
      sender_name: visitor_name || "Visitor",
      sender_identifier: visitor_email || null,
      message_content: message,
      matched_keywords: matchedKws,
      priority: matchedKws.length > 0 ? "medium" : "normal",
      metadata: { ai_conversation_id: conversation?.id, ai_auto_replied: isAutoReply },
    });

    return new Response(JSON.stringify({
      reply,
      conversation_id: conversation?.id,
      is_auto_reply: isAutoReply,
      complexity,
      ai_replies_used: currentUsed + 1,
      ai_replies_limit: limit,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dedicated-ai-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
