import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getEffectivePlan = (plan: string, status: string, gracePeriodEnd: string | null, trialEnd: string | null): string => {
  const now = new Date();

  if (trialEnd && new Date(trialEnd) < now && status === "trialing") return "standard";
  if (status === "past_due") return gracePeriodEnd && new Date(gracePeriodEnd) > now ? plan : "standard";
  if (["canceled", "unpaid"].includes(status)) return "standard";
  return plan;
};

const loadPlanLimits = async (supabase: any) => {
  const { data, error } = await supabase
    .from("pricing_settings")
    .select("plan_key, channels_limit, keywords_limit, ai_replies_per_day_limit, leads_per_month_limit, team_members_limit")
    .eq("is_donation", false);

  if (error) throw error;

  const map: Record<string, Record<string, number>> = {};
  for (const row of data || []) {
    map[row.plan_key] = {
      channels: row.channels_limit ?? -1,
      keywords: row.keywords_limit ?? -1,
      aiRepliesPerDay: row.ai_replies_per_day_limit ?? -1,
      leadsPerMonth: row.leads_per_month_limit ?? -1,
      teamMembers: row.team_members_limit ?? -1,
    };
  }

  return Object.keys(map).length > 0
    ? map
    : {
        standard: { channels: 3, keywords: 10, aiRepliesPerDay: 20, leadsPerMonth: 100, teamMembers: 1 },
        professional: { channels: 15, keywords: 50, aiRepliesPerDay: 100, leadsPerMonth: 500, teamMembers: 5 },
        advanced: { channels: 50, keywords: 100, aiRepliesPerDay: 500, leadsPerMonth: 2000, teamMembers: 20 },
        enterprise: { channels: -1, keywords: -1, aiRepliesPerDay: -1, leadsPerMonth: -1, teamMembers: -1 },
      };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const [{ action, resource }, { data: roleRows, error: roleError }] = await Promise.all([
      req.json(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    if (roleError) throw roleError;

    const roles = (roleRows || []).map((row: { role: string }) => row.role);
    const hasPrivilegedBypass = roles.includes("super_admin") || roles.includes("business_owner") || roles.includes("admin");

    if (hasPrivilegedBypass) {
      return new Response(JSON.stringify({ allowed: true, currentPlan: "enterprise", bypassed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planLimits = await loadPlanLimits(supabase);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, leads_used, ai_replies_today, ai_replies_reset_at, subscription_status, grace_period_end, trial_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const plan = sub?.plan || "standard";
    const planMap: Record<string, string> = { free: "standard", pro: "professional" };
    const normalizedPlan = planMap[plan] || plan;
    const subStatus = sub?.subscription_status || "active";
    const effectivePlan = getEffectivePlan(normalizedPlan, subStatus, sub?.grace_period_end, sub?.trial_end);
    const effectiveLimits = planLimits[effectivePlan] || planLimits.standard;

    if (resource === "channels") {
      const { count } = await supabase.from("channels").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const limit = effectiveLimits.channels;
      if (limit !== -1 && (count || 0) >= limit) {
        return new Response(JSON.stringify({ allowed: false, error: `Channel limit reached (${count}/${limit}). Upgrade to add more channels.`, currentPlan: effectivePlan, limit, current: count }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (resource === "keywords") {
      const { count } = await supabase.from("keywords").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const limit = effectiveLimits.keywords;
      if (limit !== -1 && (count || 0) >= limit) {
        return new Response(JSON.stringify({ allowed: false, error: `Keyword limit reached (${count}/${limit}). Upgrade to add more keywords.`, currentPlan: effectivePlan, limit, current: count }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (resource === "leads") {
      const limit = effectiveLimits.leadsPerMonth;
      const used = sub?.leads_used || 0;
      if (limit !== -1 && used >= limit) {
        return new Response(JSON.stringify({ allowed: false, error: `Monthly lead limit reached (${used}/${limit}). Upgrade for more leads.`, currentPlan: effectivePlan, limit, current: used }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (resource === "ai_replies") {
      const limit = effectiveLimits.aiRepliesPerDay;
      const used = sub?.ai_replies_today || 0;
      const resetAt = sub?.ai_replies_reset_at ? new Date(sub.ai_replies_reset_at) : new Date(0);
      const now = new Date();
      const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);
      const effectiveUsed = hoursSinceReset >= 24 ? 0 : used;

      if (limit !== -1 && effectiveUsed >= limit) {
        return new Response(JSON.stringify({ allowed: false, error: `Daily AI reply limit reached (${effectiveUsed}/${limit}). Upgrade for more AI replies.`, currentPlan: effectivePlan, limit, current: effectiveUsed }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "increment") {
        if (hoursSinceReset >= 24) {
          await supabase.from("subscriptions").update({ ai_replies_today: 1, ai_replies_reset_at: now.toISOString() }).eq("user_id", user.id);
        } else {
          await supabase.from("subscriptions").update({ ai_replies_today: effectiveUsed + 1 }).eq("user_id", user.id);
        }
      }
    }

    return new Response(JSON.stringify({ allowed: true, currentPlan: effectivePlan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
