import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { indexPricingCatalogByPlanKey, loadPricingCatalogRows } from "../_shared/monetization-catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("User not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.json();
    const {
      priceId: rawPriceId,
      planKey,
      packageType: rawPackageType,
      donationAmount,
      donationRecurring,
      addonType,
      addonLabel,
      addonPrice,
      addonQuantity,
    } = body ?? {};

    const catalogRows = await loadPricingCatalogRows(supabaseClient);
    const pricingByPlanKey = indexPricingCatalogByPlanKey(catalogRows);
    const resolvedPlanKey = typeof planKey === "string" ? planKey : null;
    const resolvedPriceId = rawPriceId ?? (resolvedPlanKey ? pricingByPlanKey[resolvedPlanKey]?.stripe_price_id : null);

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;
    const origin = req.headers.get("origin") || "https://talk-finder-bot.lovable.app";
    const packageType = rawPackageType === "3-month" || rawPackageType === "6-month" || rawPackageType === "yearly" ? rawPackageType : "monthly";
    const commitmentMonths = packageType === "3-month" ? 3 : packageType === "6-month" ? 6 : packageType === "yearly" ? 12 : 1;
    const packageDiscountPercent = packageType === "3-month" ? 5 : packageType === "6-month" ? 10 : packageType === "yearly" ? 20 : 0;

    if (donationAmount) {
      const amountCents = Math.round(Number(donationAmount) * 100);

      if (donationRecurring) {
        const price = await stripe.prices.create({
          unit_amount: amountCents,
          currency: "usd",
          recurring: { interval: "month" },
          product_data: { name: "LeadPulse Monthly Support" },
        });

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          customer_email: customerId ? undefined : user.email,
          line_items: [{ price: price.id, quantity: 1 }],
          mode: "subscription",
          success_url: `${origin}/pricing?checkout=success&type=donation`,
          cancel_url: `${origin}/pricing?checkout=canceled`,
        });

        return jsonResponse({ url: session.url });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "LeadPulse One-time Support" },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${origin}/pricing?checkout=success&type=donation`,
        cancel_url: `${origin}/pricing?checkout=canceled`,
      });

      return jsonResponse({ url: session.url });
    }

    if (addonType && addonPrice) {
      const amountCents = Math.round(Number(addonPrice) * 100);
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: addonLabel || `Media Pack: ${addonType}` },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        mode: "payment",
        metadata: {
          addon_type: addonType,
          addon_quantity: String(addonQuantity || 0),
          user_id: user.id,
        },
        success_url: `${origin}/media-studio?checkout=success&type=addon`,
        cancel_url: `${origin}/media-studio?checkout=canceled`,
      });

      return jsonResponse({ url: session.url });
    }

    if (!resolvedPlanKey && !resolvedPriceId) throw new Error("planKey is required");
    if (!resolvedPriceId) throw new Error(`No checkout price configured${resolvedPlanKey ? ` for ${resolvedPlanKey}` : ""}`);

    let discountCouponId: string | undefined;
    let referralDiscountPercent = 0;
    let referralDiscountDurationMonths = 0;
    const referralCode = user.user_metadata?.referral_code;

    if (referralCode) {
      const { data: partner } = await supabaseClient
        .from("partner_accounts")
        .select("referral_discount_percent, discount_duration_months, status")
        .eq("referral_code", referralCode)
        .eq("status", "active")
        .maybeSingle();

      if (partner && partner.referral_discount_percent > 0) {
        referralDiscountPercent = Number(partner.referral_discount_percent);
        referralDiscountDurationMonths = Number(partner.discount_duration_months || 1);
      }
    } else {
      const { data: sub } = await supabaseClient
        .from("subscriptions")
        .select("workspace_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (sub?.workspace_id) {
        const { data: ws } = await supabaseClient
          .from("workspaces")
          .select("referred_by_partner_id")
          .eq("id", sub.workspace_id)
          .maybeSingle();

        if (ws?.referred_by_partner_id) {
          const { data: partner } = await supabaseClient
            .from("partner_accounts")
            .select("referral_discount_percent, discount_duration_months")
            .eq("id", ws.referred_by_partner_id)
            .eq("status", "active")
            .maybeSingle();

          if (partner && partner.referral_discount_percent > 0) {
            referralDiscountPercent = Number(partner.referral_discount_percent);
            referralDiscountDurationMonths = Number(partner.discount_duration_months || 1);
          }
        }
      }
    }

    const appliedDiscountPercent = referralDiscountPercent > 0 ? referralDiscountPercent : packageDiscountPercent;
    const appliedDiscountDurationMonths = referralDiscountPercent > 0
      ? referralDiscountDurationMonths
      : packageDiscountPercent > 0
        ? commitmentMonths
        : 0;

    if (appliedDiscountPercent > 0) {
      try {
        const coupon = await stripe.coupons.create({
          percent_off: appliedDiscountPercent,
          duration: appliedDiscountDurationMonths > 1 ? "repeating" : "once",
          duration_in_months: appliedDiscountDurationMonths > 1 ? appliedDiscountDurationMonths : undefined,
          name: referralDiscountPercent > 0
            ? `Referral Discount (${appliedDiscountPercent}%)`
            : `Commitment Discount (${appliedDiscountPercent}%)`,
        });
        discountCouponId = coupon.id;
      } catch (couponErr) {
        console.error("[CREATE-CHECKOUT] Coupon error:", couponErr);
      }
    }

    // Only grant trial to users without an existing Stripe subscription
    let trialDays: number | undefined = undefined;
    if (customerId) {
      const existingSubs = await stripe.subscriptions.list({ customer: customerId, limit: 5 });
      const hasHadSub = existingSubs.data.length > 0;
      if (!hasHadSub) trialDays = 7;
    } else {
      trialDays = 7;
    }

    const packageEndsAt = new Date();
    packageEndsAt.setDate(packageEndsAt.getDate() + trialDays);
    packageEndsAt.setMonth(packageEndsAt.getMonth() + commitmentMonths);

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: !discountCouponId,
      metadata: {
        user_id: user.id,
        plan_key: resolvedPlanKey ?? "standard",
        package_type: packageType,
        commitment_months: String(commitmentMonths),
      },
      subscription_data: {
        ...(trialDays ? { trial_period_days: trialDays } : {}),
        cancel_at: Math.floor(packageEndsAt.getTime() / 1000),
        metadata: {
          user_id: user.id,
          plan_key: resolvedPlanKey ?? "standard",
          package_type: packageType,
          commitment_months: String(commitmentMonths),
        },
      },
      success_url: `${origin}/subscription?checkout=success${resolvedPlanKey ? `&plan=${resolvedPlanKey}` : ""}`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
    };

    if (discountCouponId) {
      sessionConfig.discounts = [{ coupon: discountCouponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return jsonResponse({ url: session.url });
  } catch (error) {
    console.error("create-checkout error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
