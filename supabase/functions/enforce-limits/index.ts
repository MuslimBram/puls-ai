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
    // action: "add" | "check", resource: "channels" | "keywords" | "leads" | etc.

    // Get user's subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, leads_used")
      .eq("user_id", user.id)
      .maybeSingle();

    const plan = sub?.plan || "standard";
    // Map old names
    const planMap: Record<string, string> = { free: "standard", pro: "professional" };
    const normalizedPlan = planMap[plan] || plan;
    const limits = PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS.standard;

    if (resource === "channels") {
      const { count } = await supabase.from("channels").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const limit = limits.channels;
      if (limit !== -1 && (count || 0) >= limit) {
        return new Response(JSON.stringify({
          allowed: false,
          error: `Channel limit reached (${count}/${limit}). Upgrade to add more channels.`,
          currentPlan: normalizedPlan,
          limit,
          current: count,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (resource === "keywords") {
      const { count } = await supabase.from("keywords").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const limit = limits.keywords;
      if (limit !== -1 && (count || 0) >= limit) {
        return new Response(JSON.stringify({
          allowed: false,
          error: `Keyword limit reached (${count}/${limit}). Upgrade to add more keywords.`,
          currentPlan: normalizedPlan,
          limit,
          current: count,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (resource === "leads") {
      const limit = limits.leadsPerMonth;
      const used = sub?.leads_used || 0;
      if (limit !== -1 && used >= limit) {
        return new Response(JSON.stringify({
          allowed: false,
          error: `Monthly lead limit reached (${used}/${limit}). Upgrade for more leads.`,
          currentPlan: normalizedPlan,
          limit,
          current: used,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ allowed: true, currentPlan: normalizedPlan }), {
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
