import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const body = await req.json();
    const { priceId, donationAmount, donationRecurring, addonType, addonLabel, addonPrice, addonQuantity } = body;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://talk-finder-bot.lovable.app";

    // Donation flow
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

        return new Response(JSON.stringify({ url: session.url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
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

        return new Response(JSON.stringify({ url: session.url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Regular subscription flow
    if (!priceId) throw new Error("priceId is required");

    // Check for referral discount
    let discountCouponId: string | undefined;
    const referralCode = user.user_metadata?.referral_code;
    
    if (referralCode) {
      // Look up the partner and their discount config
      const { data: partner } = await supabaseClient
        .from("partner_accounts")
        .select("referral_discount_percent, discount_duration_months, status")
        .eq("referral_code", referralCode)
        .eq("status", "active")
        .maybeSingle();

      if (partner && partner.referral_discount_percent > 0) {
        try {
          // Create a Stripe coupon for this referral
          const coupon = await stripe.coupons.create({
            percent_off: partner.referral_discount_percent,
            duration: partner.discount_duration_months > 1 ? "repeating" : "once",
            duration_in_months: partner.discount_duration_months > 1 ? partner.discount_duration_months : undefined,
            name: `Referral Discount (${partner.referral_discount_percent}%)`,
          });
          discountCouponId = coupon.id;
          console.log(`[CREATE-CHECKOUT] Applied referral discount: ${partner.referral_discount_percent}% for ${partner.discount_duration_months} months`);
        } catch (couponErr) {
          console.error("[CREATE-CHECKOUT] Failed to create coupon:", couponErr);
        }
      }
    } else {
      // Also check workspace referral (user may have signed up via referral link)
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
            try {
              const coupon = await stripe.coupons.create({
                percent_off: partner.referral_discount_percent,
                duration: partner.discount_duration_months > 1 ? "repeating" : "once",
                duration_in_months: partner.discount_duration_months > 1 ? partner.discount_duration_months : undefined,
                name: `Partner Referral (${partner.referral_discount_percent}%)`,
              });
              discountCouponId = coupon.id;
            } catch (couponErr) {
              console.error("[CREATE-CHECKOUT] Coupon error:", couponErr);
            }
          }
        }
      }
    }

    const sessionConfig: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: !discountCouponId, // Disable promo codes if referral discount applied
      subscription_data: { trial_period_days: 7 },
      success_url: `${origin}/subscription?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
    };

    // Apply referral coupon if available
    if (discountCouponId) {
      sessionConfig.discounts = [{ coupon: discountCouponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-checkout error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
