import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRODUCT_MAP: Record<string, string> = {
  "prod_U8Qdd9foXaeqnn": "standard",
  "prod_U8LrDc0TasNxNH": "standard",
  "prod_U8Lr5611OwyJSV": "professional",
  "prod_U8LrRodC8eZsTT": "advanced",
  "prod_U8LsXPlxbqhpmK": "enterprise",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[CHECK-SUBSCRIPTION] ${step}${details ? ` ${JSON.stringify(details)}` : ""}`);
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getIsoDate = (unixSeconds?: number | null) =>
  typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started", { method: req.method });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are missing");
    }

    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("No valid authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError) {
      throw new Error(`Auth error: ${userError.message}`);
    }

    const user = userData.user;
    if (!user?.id || !user.email) {
      throw new Error("User not authenticated");
    }

    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    const syncSubscriptionRow = async (payload: Record<string, unknown>) => {
      const { error } = await supabaseClient
        .from("subscriptions")
        .update(payload)
        .eq("user_id", user.id);

      if (error) {
        logStep("Subscription sync skipped due to DB error", { message: error.message });
      }
    };

    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      await syncSubscriptionRow({ plan: "standard", subscription_status: "none" });
      return jsonResponse({ subscribed: false, plan: "standard", status: "none" });
    }

    const customerId = customers.data[0].id;
    logStep("Stripe customer found", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
    });

    const prioritizedStatuses = ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete"];
    const sub =
      subscriptions.data.sort(
        (a, b) => prioritizedStatuses.indexOf(a.status) - prioritizedStatuses.indexOf(b.status),
      )[0] ?? null;

    if (!sub) {
      logStep("No Stripe subscriptions found");
      await syncSubscriptionRow({
        plan: "standard",
        subscription_status: "none",
        stripe_customer_id: customerId,
      });
      return jsonResponse({ subscribed: false, plan: "standard", status: "none" });
    }

    const rawProduct = sub.items.data[0]?.price?.product;
    const productId = typeof rawProduct === "string" ? rawProduct : rawProduct?.id ?? "";
    const plan = PRODUCT_MAP[productId] || "standard";
    const status = sub.status;

    logStep("Subscription resolved", { subscriptionId: sub.id, status, plan, productId });

    await syncSubscriptionRow({
      plan,
      subscription_status: status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      billing_cycle_start: getIsoDate(sub.current_period_start),
      trial_start: getIsoDate(sub.trial_start),
      trial_end: getIsoDate(sub.trial_end),
    });

    const { data: subData, error: subDataError } = await supabaseClient
      .from("subscriptions")
      .select("leads_used, ai_replies_today, grace_period_end, trial_start, trial_end, referral_discount_percent, referral_discount_months_remaining, referral_discount_expires_at, total_discount_savings")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subDataError) {
      logStep("Usage read skipped due to DB error", { message: subDataError.message });
    }

    const isActive = ["active", "trialing"].includes(status);

    return jsonResponse({
      subscribed: isActive,
      plan: isActive ? plan : "standard",
      status,
      subscription_end: getIsoDate(sub.current_period_end),
      trial_end: getIsoDate(sub.trial_end),
      trial_start: getIsoDate(sub.trial_start),
      cancel_at_period_end: sub.cancel_at_period_end,
      grace_period_end: subData?.grace_period_end || null,
      leads_used: subData?.leads_used || 0,
      ai_replies_today: subData?.ai_replies_today || 0,
      referral_discount:
        subData?.referral_discount_percent && subData.referral_discount_percent > 0
          ? {
              percent: subData.referral_discount_percent,
              months_remaining: subData.referral_discount_months_remaining,
              expires_at: subData.referral_discount_expires_at,
              total_savings: subData.total_discount_savings || 0,
            }
          : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message });
    return jsonResponse({ error: message }, 500);
  }
});