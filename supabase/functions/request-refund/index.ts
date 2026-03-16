import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Usage thresholds that block refund
const REFUND_USAGE_THRESHOLDS = {
  leads_created: 10,
  ai_replies_used: 20,
  channels_connected: 3,
  campaigns_launched: 1,
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

    const { reason } = await req.json();

    // Get subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*, workspace_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub) throw new Error("No subscription found");
    if (!sub.stripe_subscription_id) throw new Error("No active Stripe subscription");

    // Check if already refunded this period
    const { data: existingRefund } = await supabase
      .from("subscription_refunds")
      .select("id")
      .eq("workspace_id", sub.workspace_id)
      .in("refund_status", ["requested", "approved", "processed"])
      .maybeSingle();

    if (existingRefund) throw new Error("A refund request already exists for this period");

    // Check refund window (7 days from billing cycle start)
    const billingStart = sub.billing_cycle_start ? new Date(sub.billing_cycle_start) : null;
    if (!billingStart) throw new Error("Cannot determine billing cycle");

    const refundWindowDays = 7;
    const windowEnd = new Date(billingStart);
    windowEnd.setDate(windowEnd.getDate() + refundWindowDays);

    if (new Date() > windowEnd) {
      throw new Error(`Refund window has expired. Refunds must be requested within ${refundWindowDays} days of billing.`);
    }

    // Block renewal refunds (only first payment eligible)
    // Check how many successful invoices exist
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (sub.stripe_customer_id) {
      const invoices = await stripe.invoices.list({
        customer: sub.stripe_customer_id,
        subscription: sub.stripe_subscription_id,
        status: "paid",
        limit: 5,
      });

      if (invoices.data.length > 1) {
        throw new Error("Renewals are not eligible for refunds. Only the first payment can be refunded.");
      }
    }

    // Check usage thresholds
    const usageSnapshot: Record<string, number> = {};

    // Leads created
    const { count: leadsCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", billingStart.toISOString());
    usageSnapshot.leads_created = leadsCount || 0;

    // AI replies used
    usageSnapshot.ai_replies_used = sub.ai_replies_today || 0;

    // Channels connected
    const { count: channelsCount } = await supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_enabled", true);
    usageSnapshot.channels_connected = channelsCount || 0;

    // Campaigns launched
    const { count: campaignsCount } = await supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", billingStart.toISOString());
    usageSnapshot.campaigns_launched = campaignsCount || 0;

    // Check if referred subscription → stricter thresholds
    const { data: ws } = await supabase
      .from("workspaces")
      .select("referred_by_partner_id")
      .eq("id", sub.workspace_id)
      .maybeSingle();

    const isReferred = !!ws?.referred_by_partner_id;
    const thresholds = { ...REFUND_USAGE_THRESHOLDS };
    if (isReferred) {
      // Stricter for referral subscriptions
      thresholds.leads_created = 5;
      thresholds.ai_replies_used = 10;
      thresholds.channels_connected = 2;
    }

    const violations: string[] = [];
    if (usageSnapshot.leads_created > thresholds.leads_created)
      violations.push(`leads_created (${usageSnapshot.leads_created}/${thresholds.leads_created})`);
    if (usageSnapshot.ai_replies_used > thresholds.ai_replies_used)
      violations.push(`ai_replies_used (${usageSnapshot.ai_replies_used}/${thresholds.ai_replies_used})`);
    if (usageSnapshot.channels_connected > thresholds.channels_connected)
      violations.push(`channels_connected (${usageSnapshot.channels_connected}/${thresholds.channels_connected})`);
    if (usageSnapshot.campaigns_launched > thresholds.campaigns_launched)
      violations.push(`campaigns_launched (${usageSnapshot.campaigns_launched}/${thresholds.campaigns_launched})`);

    if (violations.length > 0) {
      throw new Error(`Refund blocked due to usage exceeding thresholds: ${violations.join(", ")}`);
    }

    // Get latest payment intent
    let paymentIntentId = null;
    let refundAmount = 0;
    if (sub.stripe_customer_id) {
      const invoices = await stripe.invoices.list({
        customer: sub.stripe_customer_id,
        subscription: sub.stripe_subscription_id,
        status: "paid",
        limit: 1,
      });
      if (invoices.data.length > 0) {
        paymentIntentId = invoices.data[0].payment_intent as string;
        refundAmount = (invoices.data[0].amount_paid || 0) / 100;
      }
    }

    // Create refund request
    const { error: insertErr } = await supabase.from("subscription_refunds").insert({
      workspace_id: sub.workspace_id,
      subscription_id: sub.stripe_subscription_id,
      payment_intent_id: paymentIntentId,
      refund_reason: reason || "Customer request",
      refund_status: "requested",
      refund_window_expires_at: windowEnd.toISOString(),
      usage_snapshot_json: usageSnapshot,
      refund_amount: refundAmount,
      user_id: user.id,
    });

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({
      success: true,
      refund_amount: refundAmount,
      message: "Refund request submitted for admin review",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[REQUEST-REFUND] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
