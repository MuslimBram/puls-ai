import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// product_id → plan key mapping
const PRODUCT_MAP: Record<string, string> = {
  "prod_U8LrDc0TasNxNH": "standard",
  "prod_U8Lr5611OwyJSV": "professional",
  "prod_U8LrRodC8eZsTT": "advanced",
  "prod_U8LsXPlxbqhpmK": "enterprise",
};

const GRACE_PERIOD_DAYS = 7;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey) return new Response("Missing STRIPE_SECRET_KEY", { status: 500 });

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const body = await req.text();
    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers.get("stripe-signature");
      if (!signature) return new Response("Missing stripe-signature", { status: 400 });
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      // Fallback: parse without verification (dev mode)
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log(`[STRIPE-WEBHOOK] Event: ${event.type}, ID: ${event.id}`);

    const handleSubscription = async (subscription: Stripe.Subscription) => {
      const customerId = subscription.customer as string;
      const customer = await stripe.customers.retrieve(customerId);
      if ((customer as any).deleted) return;

      const email = (customer as Stripe.Customer).email;
      if (!email) {
        console.error("[STRIPE-WEBHOOK] No email on customer", customerId);
        return;
      }

      // Find user by email
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users?.users?.find((u) => u.email === email);
      if (!user) {
        console.error("[STRIPE-WEBHOOK] No user found for email", email);
        return;
      }

      const productId = subscription.items.data[0]?.price?.product as string;
      const plan = PRODUCT_MAP[productId] || "standard";
      const status = subscription.status; // active, trialing, past_due, canceled, unpaid

      const updateData: Record<string, any> = {
        plan: ["active", "trialing"].includes(status) ? plan : "standard",
        subscription_status: status,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        billing_cycle_start: new Date(subscription.current_period_start * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Trial tracking
      if (subscription.trial_start) {
        updateData.trial_start = new Date(subscription.trial_start * 1000).toISOString();
      }
      if (subscription.trial_end) {
        updateData.trial_end = new Date(subscription.trial_end * 1000).toISOString();
      }

      // Grace period on payment failure
      if (status === "past_due") {
        const graceEnd = new Date();
        graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);
        updateData.grace_period_end = graceEnd.toISOString();
      }

      // If canceled or unpaid, clear grace period and downgrade
      if (["canceled", "unpaid"].includes(status)) {
        updateData.grace_period_end = null;
        updateData.plan = "standard";
      }

      // If active, clear grace period
      if (status === "active") {
        updateData.grace_period_end = null;
      }

      const { error } = await supabase
        .from("subscriptions")
        .update(updateData)
        .eq("user_id", user.id);

      if (error) console.error("[STRIPE-WEBHOOK] DB update error:", error);
      else console.log(`[STRIPE-WEBHOOK] Updated user ${user.id} to plan=${updateData.plan}, status=${status}`);
    };

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscription(subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId);
          await handleSubscription(subscription);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId);
          await handleSubscription(subscription);
        }
        break;
      }

      default:
        console.log(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
