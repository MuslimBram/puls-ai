import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Plan limits configuration (server-side source of truth)
const PLAN_LIMITS: Record<string, Record<string, number>> = {
  standard: { channels: 3, keywords: 10, aiRepliesPerDay: 20, leadsPerMonth: 100, teamMembers: 1 },
  professional: { channels: 15, keywords: 50, aiRepliesPerDay: 100, leadsPerMonth: 500, teamMembers: 5 },
  advanced: { channels: 50, keywords: 100, aiRepliesPerDay: 500, leadsPerMonth: 2000, teamMembers: 20 },
  enterprise: { channels: -1, keywords: -1, aiRepliesPerDay: -1, leadsPerMonth: -1, teamMembers: -1 },
};

const GRACE_PERIOD_DAYS = 7;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { action, resource } = await req.json();

    // Get user's subscription with all status info
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, leads_used, ai_replies_today, ai_replies_reset_at, subscription_status, grace_period_end, trial_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const plan = sub?.plan || "standard";
    const planMap: Record<string, string> = { free: "standard", pro: "professional" };
    const normalizedPlan = planMap[plan] || plan;
    const limits = PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS.standard;

    // Check subscription status - enforce downgrade if expired/past_due beyond grace
    const subStatus = sub?.subscription_status || "active";
    const effectivePlan = getEffectivePlan(normalizedPlan, subStatus, sub?.grace_period_end, sub?.trial_end);
    const effectiveLimits = PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.standard;

    if (resource === "channels") {
      const { count } = await supabase.from("channels").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const limit = effectiveLimits.channels;
      if (limit !== -1 && (count || 0) >= limit) {
        return new Response(JSON.stringify({
          allowed: false,
          error: `Channel limit reached (${count}/${limit}). Upgrade to add more channels.`,
          currentPlan: effectivePlan,
          limit,
          current: count,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (resource === "keywords") {
      const { count } = await supabase.from("keywords").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const limit = effectiveLimits.keywords;
      if (limit !== -1 && (count || 0) >= limit) {
        return new Response(JSON.stringify({
          allowed: false,
          error: `Keyword limit reached (${count}/${limit}). Upgrade to add more keywords.`,
          currentPlan: effectivePlan,
          limit,
          current: count,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (resource === "leads") {
      const limit = effectiveLimits.leadsPerMonth;
      const used = sub?.leads_used || 0;
      if (limit !== -1 && used >= limit) {
        return new Response(JSON.stringify({
          allowed: false,
          error: `Monthly lead limit reached (${used}/${limit}). Upgrade for more leads.`,
          currentPlan: effectivePlan,
          limit,
          current: used,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (resource === "ai_replies") {
      const limit = effectiveLimits.aiRepliesPerDay;
      const used = sub?.ai_replies_today || 0;

      // Check if daily counter needs reset
      const resetAt = sub?.ai_replies_reset_at ? new Date(sub.ai_replies_reset_at) : new Date(0);
      const now = new Date();
      const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);
      const effectiveUsed = hoursSinceReset >= 24 ? 0 : used;

      if (limit !== -1 && effectiveUsed >= limit) {
        return new Response(JSON.stringify({
          allowed: false,
          error: `Daily AI reply limit reached (${effectiveUsed}/${limit}). Upgrade for more AI replies.`,
          currentPlan: effectivePlan,
          limit,
          current: effectiveUsed,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // If action is "increment", bump the counter
      if (action === "increment") {
        if (hoursSinceReset >= 24) {
          await supabase.from("subscriptions").update({
            ai_replies_today: 1,
            ai_replies_reset_at: now.toISOString(),
          }).eq("user_id", user.id);
        } else {
          await supabase.from("subscriptions").update({
            ai_replies_today: effectiveUsed + 1,
          }).eq("user_id", user.id);
        }
      }
    }

    return new Response(JSON.stringify({ allowed: true, currentPlan: effectivePlan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("enforce-limits error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getEffectivePlan(plan: string, status: string, gracePeriodEnd: string | null, trialEnd: string | null): string {
  const now = new Date();

  // If trial has expired and status isn't active, downgrade
  if (trialEnd && new Date(trialEnd) < now && status === "trialing") {
    return "standard";
  }

  // If past_due, check grace period
  if (status === "past_due") {
    if (gracePeriodEnd && new Date(gracePeriodEnd) > now) {
      // Still in grace period - keep current plan
      return plan;
    }
    // Grace period expired - downgrade
    return "standard";
  }

  // If canceled or unpaid, always standard
  if (["canceled", "unpaid"].includes(status)) {
    return "standard";
  }

  return plan;
}
