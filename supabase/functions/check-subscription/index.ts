import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { indexPricingCatalogByProductId, loadPricingCatalogRows } from "../_shared/monetization-catalog.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { loadCallerRoles, staffRolesOf } from "../_shared/platform-roles.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

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

const jsonResponse = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
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

type StoredSubscription = {
  plan?: string | null;
  subscription_status?: string | null;
  leads_used?: number | null;
  ai_replies_today?: number | null;
  grace_period_end?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  referral_discount_percent?: number | null;
  referral_discount_months_remaining?: number | null;
  referral_discount_expires_at?: string | null;
  total_discount_savings?: number | null;
  package_type?: string | null;
  package_start_at?: string | null;
  package_end_at?: string | null;
};

const buildStoredSubscriptionResponse = (
  storedSubscription: StoredSubscription | null,
  overrides?: Partial<{
    plan: string;
    selected_plan: string;
    status: string;
    subscribed: boolean;
  }>,
) => {
  const storedPackageType = normalizePackageType(storedSubscription?.package_type);
  const effectiveStatus = overrides?.status ?? resolveStatus(storedSubscription?.subscription_status, storedSubscription?.trial_end ?? null, false);
  const subscribed = overrides?.subscribed ?? (effectiveStatus === "active" || effectiveStatus === "trialing");
  const plan = overrides?.plan ?? storedSubscription?.plan ?? "standard";
  const selectedPlan = overrides?.selected_plan ?? storedSubscription?.plan ?? plan;

  return {
    subscribed,
    plan,
    selected_plan: selectedPlan,
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
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  try {
    logStep("Function started", { method: req.method });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = getServiceKey();
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !serviceRoleKey) throw new Error("Backend environment variables are missing");

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No valid authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData?.user?.id || !userData?.user?.email) {
      return jsonResponse(req, {
        subscribed: false,
        plan: "standard",
        selected_plan: "standard",
        status: "none",
        status_label: "No subscription",
        package_type: "monthly",
        leads_used: 0,
        ai_replies_today: 0,
      });
    }

    const user = userData.user;

    // FAZA 1A — PLATFORM STAFF ONLY.
    //
    // This block previously also bypassed for `business_owner`. That role is
    // granted by bootstrap_user_account_for() to EVERY user on EVERY login
    // (5 of 5 accounts in production hold it), so the effect was that every
    // account on the platform read back as a subscribed top-tier customer and
    // no one ever had a reason to pay.
    //
    // The comment that used to sit here justified the bypass by claiming parity
    // with enforce-limits and generate-media. Both claims were false by
    // 2026-09-15: enforce-limits v52 had already removed business_owner, and
    // generate-media v50 has no role bypass at all.
    //
    // Roles now come from the single shared source so this cannot drift again.
    const { data: roleRows, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (roleError) logStep("Role lookup failed, continuing without bypass", { message: roleError.message });

    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    const staffRoles = staffRolesOf(roles);
    const hasPrivilegedBypass = staffRoles.length > 0;

    const catalogRows = await loadPricingCatalogRows(supabaseClient);
    const productMap = indexPricingCatalogByProductId(catalogRows);

    if (hasPrivilegedBypass) {
      // Resolve the top-tier plan using the same ordering the frontend
      // catalog uses (sort_order, then plan_key) — not array position —
      // so this stays correct regardless of row insertion order and even
      // if plan tiers/names change later.
      const { data: orderedPlans, error: orderedPlansError } = await supabaseClient
        .from("pricing_settings")
        .select("plan_key")
        .eq("is_donation", false)
        .eq("is_public", true)
        .order("sort_order", { ascending: true })
        .order("plan_key", { ascending: true });
      if (orderedPlansError) logStep("Top plan lookup failed, defaulting to enterprise", { message: orderedPlansError.message });

      const planKeys = (orderedPlans || []).map((r: { plan_key: string }) => r.plan_key);
      const topPlanKey = planKeys.length > 0 ? planKeys[planKeys.length - 1] : "enterprise";

      return jsonResponse(req, {
        subscribed: true,
        plan: topPlanKey,
        selected_plan: topPlanKey,
        status: "active",
        status_label: "Admin access",
        trial_end: null,
        trial_start: null,
        grace_period_end: null,
        leads_used: 0,
        ai_replies_today: 0,
        package_type: "yearly",
        package_start_at: null,
        package_end_at: null,
        commitment_months: 12,
        referral_discount: null,
        privileged_bypass: true,
        // Named so an unlimited answer is auditable rather than unexplained.
        bypass_roles: staffRoles,
      });
    }

    const syncSubscriptionRow = async (payload: Record<string, unknown>) => {
      const { error } = await supabaseClient.from("subscriptions").update(payload).eq("user_id", user.id);
      if (error) logStep("Subscription sync skipped due to DB error", { message: error.message });
    };

    const { data: storedSubscription } = await supabaseClient
      .from("subscriptions")
      .select("plan, subscription_status, leads_used, ai_replies_today, grace_period_end, trial_start, trial_end, referral_discount_percent, referral_discount_months_remaining, referral_discount_expires_at, total_discount_savings, package_type, package_start_at, package_end_at")
      .eq("user_id", user.id)
      .maybeSingle();

    // --- If no Stripe key, return DB-only subscription data ---
    if (!stripeKey) {
      logStep("No STRIPE_SECRET_KEY, returning DB-only subscription data");
      return jsonResponse(req, buildStoredSubscriptionResponse(storedSubscription));
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    try {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });

      if (customers.data.length === 0) {
        const effectiveStatus = resolveStatus(storedSubscription?.subscription_status, storedSubscription?.trial_end ?? null, false);
        await syncSubscriptionRow({ plan: "standard", subscription_status: effectiveStatus });

        return jsonResponse(req, buildStoredSubscriptionResponse(storedSubscription, {
            plan: "standard",
            selected_plan: storedSubscription?.plan || "standard",
            status: effectiveStatus,
            subscribed: false,
          }),
        );
      }

      const customerId = customers.data[0].id;
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
      const prioritizedStatuses = ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"];
      const sub = subscriptions.data.sort((a, b) => prioritizedStatuses.indexOf(a.status) - prioritizedStatuses.indexOf(b.status))[0] ?? null;

      if (!sub) {
        const effectiveStatus = resolveStatus(storedSubscription?.subscription_status, storedSubscription?.trial_end ?? null, false);
        await syncSubscriptionRow({ plan: "standard", subscription_status: effectiveStatus, stripe_customer_id: customerId });

        return jsonResponse(req, buildStoredSubscriptionResponse(storedSubscription, {
            plan: "standard",
            selected_plan: storedSubscription?.plan || "standard",
            status: effectiveStatus,
            subscribed: false,
          }),
        );
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

      return jsonResponse(req, {
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
    } catch (stripeError) {
      const message = stripeError instanceof Error ? stripeError.message : "Unknown Stripe error";
      logStep("Stripe lookup failed, returning DB-only subscription data", { message });
      return jsonResponse(req, buildStoredSubscriptionResponse(storedSubscription));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logStep("ERROR", { message });
    return jsonResponse(req, { error: message }, 500);
  }
});