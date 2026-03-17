import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// product_id → plan key mapping
const PRODUCT_MAP: Record<string, string> = {
  "prod_U8Qdd9foXaeqnn": "standard",
  "prod_U8LrDc0TasNxNH": "standard",
  "prod_U8Lr5611OwyJSV": "professional",
  "prod_U8LrRodC8eZsTT": "advanced",
  "prod_U8LsXPlxbqhpmK": "enterprise",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      await supabaseClient.from("subscriptions").update({ plan: "standard", subscription_status: "none" }).eq("user_id", user.id);
      return new Response(JSON.stringify({ subscribed: false, plan: "standard", status: "none" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      expand: ["data.default_payment_method"],
    });

    if (subscriptions.data.length === 0) {
      await supabaseClient.from("subscriptions").update({ plan: "standard", subscription_status: "none" }).eq("user_id", user.id);
      return new Response(JSON.stringify({ subscribed: false, plan: "standard", status: "none" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sub = subscriptions.data[0];
    const productId = sub.items.data[0]?.price?.product as string;
    const plan = PRODUCT_MAP[productId] || "standard";
    const status = sub.status;

    // Sync to internal subscriptions table
    const updateData: Record<string, any> = {
      plan,
      subscription_status: status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      billing_cycle_start: new Date(sub.current_period_start * 1000).toISOString(),
    };

    if (sub.trial_start) updateData.trial_start = new Date(sub.trial_start * 1000).toISOString();
    if (sub.trial_end) updateData.trial_end = new Date(sub.trial_end * 1000).toISOString();

    await supabaseClient.from("subscriptions").update(updateData).eq("user_id", user.id);

    const isActive = ["active", "trialing"].includes(status);

    // Get current usage and discount info for frontend
    const { data: subData } = await supabaseClient
      .from("subscriptions")
      .select("leads_used, ai_replies_today, grace_period_end, trial_start, trial_end, referral_discount_percent, referral_discount_months_remaining, referral_discount_expires_at, total_discount_savings")
      .eq("user_id", user.id)
      .maybeSingle();

    return new Response(JSON.stringify({
      subscribed: isActive,
      plan: isActive ? plan : "standard",
      status,
      subscription_end: new Date(sub.current_period_end * 1000).toISOString(),
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      trial_start: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      grace_period_end: subData?.grace_period_end || null,
      leads_used: subData?.leads_used || 0,
      ai_replies_today: subData?.ai_replies_today || 0,
      referral_discount: subData?.referral_discount_percent > 0 ? {
        percent: subData.referral_discount_percent,
        months_remaining: subData.referral_discount_months_remaining,
        expires_at: subData.referral_discount_expires_at,
        total_savings: subData.total_discount_savings || 0,
      } : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("check-subscription error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
