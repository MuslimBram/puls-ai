import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { indexPricingCatalogByProductId, loadPricingCatalogRows } from "../_shared/monetization-catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PACKAGE_MONTHS: Record<string, number> = {
  monthly: 1,
  "3-month": 3,
  "6-month": 6,
  yearly: 12,
};

const QUALIFYING_PACKAGE_TYPES = new Set(["3-month", "6-month"]);
const STATUS_LABELS: Record<string, string> = {
  none: "No subscription",
  active: "Active",
  trialing: "Trial active",
  trial_expired: "Trial expired",
  past_due: "Payment required",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
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

const normalizePackageType = (value: unknown): keyof typeof PACKAGE_MONTHS => {
  if (typeof value === "string" && value in PACKAGE_MONTHS) {
    return value as keyof typeof PACKAGE_MONTHS;
  }

  return "monthly";
};

const resolveStatus = (status: string | null | undefined, trialEnd: string | null, subscribed: boolean) => {
  if (!subscribed && trialEnd && new Date(trialEnd) <= new Date()) {
    return "trial_expired";
  }

  return status || "none";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started", { method: req.method });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !serviceRoleKey) throw new Error("Backend environment variables are missing");

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No valid authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);

    const user = userData.user;
    if (!user?.id || !user.email) throw new Error("User not authenticated");

    const catalogRows = await loadPricingCatalogRows(supabaseClient);
    const productMap = indexPricingCatalogByProductId(catalogRows);

    // --- If no Stripe key, return DB-only subscription data ---
    if (!stripeKey) {
      logStep("No STRIPE_SECRET_KEY, returning DB-only subscription data");

      const { data: storedSubscription } = await supabaseClient
        .from("subscriptions")
        .select("plan, subscription_status, leads_used, ai_replies_today, grace_period_end, trial_start, trial_end, referral_discount_percent, referral_discount_months_remaining, referral_discount_expires_at, total_discount_savings, package_type, package_start_at, package_end_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const storedPackageType = normalizePackageType(storedSubscription?.package_type);
      const effectiveStatus = resolveStatus(storedSubscription?.subscription_status, storedSubscription?.trial_end ?? null, false);

      return jsonResponse({
        subscribed: effectiveStatus === "active" || effectiveStatus === "trialing",
        plan: storedSubscription?.plan || "standard",
        selected_plan: storedSubscription?.plan || "standard",
        status: effectiveStatus,
        status_label: STATUS_LABELS[effectiveStatus] || "No subscription",
        trial_end: storedSubscription?.trial_end ?? null,
        trial_start: storedSubscription?.trial_start ?? null,
        grace_period_end: storedSubscription?.grace_period_end ?? null,
        leads_used: storedSubscription?.leads_used || 0,
        ai_replies_today: storedSubscription?.ai_replies_today || 0,
        package_type: storedPackageType,
        package_start_at: storedSubscription?.package_start_at ?? null,
        package_end_at: storedSubscription?.package_end_at ?? null,
        commitment_months: PACKAGE_MONTHS[storedPackageType],
        referral_discount:
          storedSubscription?.referral_discount_percent && storedSubscription.referral_discount_percent > 0
            ? {
                percent: storedSubscription.referral_discount_percent,
                months_remaining: storedSubscription.referral_discount_months_remaining,
                expires_at: storedSubscription.referral_discount_expires_at,
                total_savings: storedSubscription.total_discount_savings || 0,
              }
            : null,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const syncSubscriptionRow = async (payload: Record<string, unknown>) => {
      const { error } = await supabaseClient.from("subscriptions").update(payload).eq("user_id", user.id);
      if (error) logStep("Subscription sync skipped due to DB error", { message: error.message });
    };

    const { data: storedSubscription } = await supabaseClient
      .from("subscriptions")
      .select("plan, subscription_status, leads_used, ai_replies_today, grace_period_end, trial_start, trial_end, referral_discount_percent, referral_discount_months_remaining, referral_discount_expires_at, total_discount_savings, package_type, package_start_at, package_end_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      const effectiveStatus = resolveStatus(storedSubscription?.subscription_status, storedSubscription?.trial_end ?? null, false);
      await syncSubscriptionRow({ plan: "standard", subscription_status: effectiveStatus });

      const storedPackageType = normalizePackageType(storedSubscription?.package_type);
      return jsonResponse({
        subscribed: false,
        plan: "standard",
        selected_plan: storedSubscription?.plan || "standard",
        status: effectiveStatus,
        status_label: STATUS_LABELS[effectiveStatus] || "No subscription",
        trial_end: storedSubscription?.trial_end ?? null,
        trial_start: storedSubscription?.trial_start ?? null,
        grace_period_end: storedSubscription?.grace_period_end ?? null,
        leads_used: storedSubscription?.leads_used || 0,
        ai_replies_today: storedSubscription?.ai_replies_today || 0,
        package_type: storedPackageType,
        package_start_at: storedSubscription?.package_start_at ?? null,
        package_end_at: storedSubscription?.package_end_at ?? null,
        commitment_months: PACKAGE_MONTHS[storedPackageType],
        referral_discount:
          storedSubscription?.referral_discount_percent && storedSubscription.referral_discount_percent > 0
            ? {
                percent: storedSubscription.referral_discount_percent,
                months_remaining: storedSubscription.referral_discount_months_remaining,
                expires_at: storedSubscription.referral_discount_expires_at,
                total_savings: storedSubscription.total_discount_savings || 0,
              }
            : null,
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const prioritizedStatuses = ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"];
    const sub = subscriptions.data.sort((a, b) => prioritizedStatuses.indexOf(a.status) - prioritizedStatuses.indexOf(b.status))[0] ?? null;

    if (!sub) {
      const effectiveStatus = resolveStatus(storedSubscription?.subscription_status, storedSubscription?.trial_end ?? null, false);
      await syncSubscriptionRow({ plan: "standard", subscription_status: effectiveStatus, stripe_customer_id: customerId });

      const storedPackageType = normalizePackageType(storedSubscription?.package_type);
      return jsonResponse({
        subscribed: false,
        plan: "standard",
        selected_plan: storedSubscription?.plan || "standard",
        status: effectiveStatus,
        status_label: STATUS_LABELS[effectiveStatus] || "No subscription",
        trial_end: storedSubscription?.trial_end ?? null,
        trial_start: storedSubscription?.trial_start ?? null,
        package_type: storedPackageType,
        package_start_at: storedSubscription?.package_start_at ?? null,
        package_end_at: storedSubscription?.package_end_at ?? null,
        commitment_months: PACKAGE_MONTHS[storedPackageType],
        grace_period_end: storedSubscription?.grace_period_end ?? null,
        leads_used: storedSubscription?.leads_used || 0,
        ai_replies_today: storedSubscription?.ai_replies_today || 0,
      });
    }

    const rawProduct = sub.items.data[0]?.price?.product;
    const productId = typeof rawProduct === "string" ? rawProduct : rawProduct?.id ?? "";
    const metadataPlan = typeof sub.metadata?.plan_key === "string" ? sub.metadata.plan_key : null;
    const selectedPlan = productMap[productId] || metadataPlan || "standard";
    const trialStart = getIsoDate(sub.trial_start) ?? storedSubscription?.trial_start ?? null;
    const trialEnd = getIsoDate(sub.trial_end) ?? storedSubscription?.trial_end ?? null;
    const subscribed = ["active", "trialing"].includes(sub.status);
    const effectiveStatus = resolveStatus(sub.status, trialEnd, subscribed);
    const packageType = normalizePackageType(sub.metadata?.package_type ?? storedSubscription?.package_type);
    const commitmentMonths = Number(sub.metadata?.commitment_months) || PACKAGE_MONTHS[packageType];
    const packageStartAt = trialStart ?? getIsoDate(sub.current_period_start) ?? storedSubscription?.package_start_at ?? null;
    const packageEndAt = getIsoDate(sub.cancel_at) ?? storedSubscription?.package_end_at ?? getIsoDate(sub.current_period_end);

    await syncSubscriptionRow({
      plan: subscribed ? selectedPlan : "standard",
      subscription_status: effectiveStatus,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      billing_cycle_start: getIsoDate(sub.current_period_start),
      trial_start: trialStart,
      trial_end: trialEnd,
      package_type: packageType,
      qualifying_package_type: QUALIFYING_PACKAGE_TYPES.has(packageType) ? packageType : null,
      package_start_at: packageStartAt,
      package_end_at: packageEndAt,
    });

    return jsonResponse({
      subscribed,
      plan: subscribed ? selectedPlan : "standard",
      selected_plan: selectedPlan,
      status: effectiveStatus,
      status_label: STATUS_LABELS[effectiveStatus] || effectiveStatus,
      subscription_end: packageEndAt ?? getIsoDate(sub.current_period_end),
      trial_end: trialEnd,
      trial_start: trialStart,
      cancel_at_period_end: sub.cancel_at_period_end,
      cancel_at: getIsoDate(sub.cancel_at),
      grace_period_end: storedSubscription?.grace_period_end || null,
      leads_used: storedSubscription?.leads_used || 0,
      ai_replies_today: storedSubscription?.ai_replies_today || 0,
      package_type: packageType,
      package_start_at: packageStartAt,
      package_end_at: packageEndAt,
      commitment_months: commitmentMonths,
      referral_discount:
        storedSubscription?.referral_discount_percent && storedSubscription.referral_discount_percent > 0
          ? {
              percent: storedSubscription.referral_discount_percent,
              months_remaining: storedSubscription.referral_discount_months_remaining,
              expires_at: storedSubscription.referral_discount_expires_at,
              total_savings: storedSubscription.total_discount_savings || 0,
            }
          : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message });
    return jsonResponse({ error: message }, 500);
  }
});