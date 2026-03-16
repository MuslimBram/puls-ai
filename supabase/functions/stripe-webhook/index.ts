import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRODUCT_MAP: Record<string, string> = {
  "prod_U8LrDc0TasNxNH": "standard",
  "prod_U8Qdd9foXaeqnn": "standard",
  "prod_U8Lr5611OwyJSV": "professional",
  "prod_U8LrRodC8eZsTT": "advanced",
  "prod_U8LsXPlxbqhpmK": "enterprise",
};

const PLAN_PRICES: Record<string, number> = {
  standard: 29, professional: 79, advanced: 149, enterprise: 399,
};

const GRACE_PERIOD_DAYS = 7;
const REFUND_WINDOW_DAYS = 7;

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

    if (webhookSecret) {
      const signature = req.headers.get("stripe-signature");
      if (!signature) return new Response("Missing stripe-signature", { status: 400 });
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log(`[STRIPE-WEBHOOK] Event: ${event.type}, ID: ${event.id}`);

    const findUserByEmail = async (email: string) => {
      const { data: users } = await supabase.auth.admin.listUsers();
      return users?.users?.find((u) => u.email === email) || null;
    };

    const handleSubscription = async (subscription: Stripe.Subscription) => {
      const customerId = subscription.customer as string;
      const customer = await stripe.customers.retrieve(customerId);
      if ((customer as any).deleted) return;

      const email = (customer as Stripe.Customer).email;
      if (!email) return;

      const user = await findUserByEmail(email);
      if (!user) return;

      const productId = subscription.items.data[0]?.price?.product as string;
      const plan = PRODUCT_MAP[productId] || "standard";
      const status = subscription.status;

      const updateData: Record<string, any> = {
        plan: ["active", "trialing"].includes(status) ? plan : "standard",
        subscription_status: status,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        billing_cycle_start: new Date(subscription.current_period_start * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (subscription.trial_start) updateData.trial_start = new Date(subscription.trial_start * 1000).toISOString();
      if (subscription.trial_end) updateData.trial_end = new Date(subscription.trial_end * 1000).toISOString();

      if (status === "past_due") {
        const graceEnd = new Date();
        graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);
        updateData.grace_period_end = graceEnd.toISOString();
      }

      if (["canceled", "unpaid"].includes(status)) {
        updateData.grace_period_end = null;
        updateData.plan = "standard";
      }

      if (status === "active") {
        updateData.grace_period_end = null;
      }

      const { error } = await supabase.from("subscriptions").update(updateData).eq("user_id", user.id);
      if (error) console.error("[STRIPE-WEBHOOK] DB update error:", error);
      else console.log(`[STRIPE-WEBHOOK] Updated user ${user.id} to plan=${updateData.plan}, status=${status}`);
    };

    // Create commission with refund window lock
    const createCommission = async (
      partnerId: string, workspaceId: string, subId: string,
      planName: string, commRate: number
    ) => {
      const grossAmount = PLAN_PRICES[planName] || 0;
      if (grossAmount === 0) return;

      const commAmount = (grossAmount * commRate) / 100;
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Avoid duplicate
      const { data: existing } = await supabase
        .from("partner_commissions")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("workspace_id", workspaceId)
        .gte("billing_period_start", periodStart.toISOString())
        .maybeSingle();

      if (existing) return;

      // Get partner's refund window config
      const { data: partnerConfig } = await supabase
        .from("partner_accounts")
        .select("refund_window_days")
        .eq("id", partnerId)
        .maybeSingle();

      const refundWindowDays = partnerConfig?.refund_window_days ?? REFUND_WINDOW_DAYS;

      // Commission starts as pending_refund_window
      await supabase.from("partner_commissions").insert({
        partner_id: partnerId,
        workspace_id: workspaceId,
        subscription_id: subId,
        plan_name: planName,
        billing_period_start: periodStart.toISOString(),
        billing_period_end: periodEnd.toISOString(),
        gross_amount: grossAmount,
        commission_percent: commRate,
        commission_amount: commAmount,
        commission_status: "pending_refund_window",
      });

      // Update wallet pending
      const { data: wallet } = await supabase
        .from("partner_wallets")
        .select("pending_amount")
        .eq("partner_id", partnerId)
        .maybeSingle();

      if (wallet) {
        await supabase
          .from("partner_wallets")
          .update({
            pending_amount: Number(wallet.pending_amount) + commAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("partner_id", partnerId);
      }

      console.log(`[STRIPE-WEBHOOK] Commission created (pending_refund_window): $${commAmount} for partner ${partnerId}`);
    };

    // Anti-abuse: detect rapid refunds from same partner
    const checkPartnerAbuse = async (partnerId: string) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count } = await supabase
        .from("subscription_refunds")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo.toISOString());

      // Check workspaces referred by this partner that have refunds
      const { data: refWs } = await supabase
        .from("workspaces")
        .select("id")
        .eq("referred_by_partner_id", partnerId);

      if (refWs && refWs.length > 0) {
        const wsIds = refWs.map(w => w.id);
        const { count: refundCount } = await supabase
          .from("subscription_refunds")
          .select("id", { count: "exact", head: true })
          .in("workspace_id", wsIds)
          .gte("created_at", thirtyDaysAgo.toISOString());

        if ((refundCount || 0) >= 3) {
          // Flag partner
          await supabase.from("partner_risk_flags").insert({
            partner_id: partnerId,
            flag_type: "rapid_refunds",
            description: `${refundCount} refunds from referred workspaces in 30 days`,
            severity: (refundCount || 0) >= 5 ? "high" : "medium",
          });
        }
      }
    };

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscription(subscription);

        // On deletion, cancel pending commissions
        if (event.type === "customer.subscription.deleted") {
          const customerId = subscription.customer as string;
          const customer = await stripe.customers.retrieve(customerId);
          if (!(customer as any).deleted) {
            const email = (customer as Stripe.Customer).email;
            if (email) {
              const user = await findUserByEmail(email);
              if (user) {
                const { data: sub } = await supabase
                  .from("subscriptions")
                  .select("workspace_id")
                  .eq("user_id", user.id)
                  .maybeSingle();

                if (sub?.workspace_id) {
                  // Cancel pending commissions for this workspace
                  await supabase
                    .from("partner_commissions")
                    .update({ commission_status: "cancelled" })
                    .eq("workspace_id", sub.workspace_id)
                    .in("commission_status", ["pending", "pending_refund_window"]);
                }
              }
            }
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId);
          await handleSubscription(subscription);
        }

        // Create payment failure notification
        const failCustomerId = invoice.customer as string;
        const failCustomer = await stripe.customers.retrieve(failCustomerId);
        if (!(failCustomer as any).deleted) {
          const failEmail = (failCustomer as Stripe.Customer).email;
          if (failEmail) {
            const failUser = await findUserByEmail(failEmail);
            if (failUser) {
              await supabase.from("payment_notifications").insert({
                user_id: failUser.id,
                notification_type: "payment_failed",
                title: "Payment Failed",
                message: `Your payment of $${((invoice.amount_due || 0) / 100).toFixed(2)} failed. Please update your payment method to avoid service interruption.`,
                severity: "critical",
                metadata: { invoice_id: invoice.id, amount: invoice.amount_due },
              });

              // Also add to business_notifications for in-app visibility
              await supabase.from("business_notifications").insert({
                user_id: failUser.id,
                notification_type: "warning",
                category: "billing",
                title: "Payment Failed",
                message: "Your subscription payment failed. Update your payment method to keep your plan active.",
                action_url: "/subscription",
              });
            }
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (subId) {
          const subscription = await stripe.subscriptions.retrieve(subId);
          await handleSubscription(subscription);

          // Record billing history
          const succCustomerId = invoice.customer as string;
          const succCustomer = await stripe.customers.retrieve(succCustomerId);
          if (!(succCustomer as any).deleted) {
            const succEmail = (succCustomer as Stripe.Customer).email;
            if (succEmail) {
              const succUser = await findUserByEmail(succEmail);
              if (succUser) {
                const { data: userSub } = await supabase
                  .from("subscriptions")
                  .select("workspace_id, plan")
                  .eq("user_id", succUser.id)
                  .maybeSingle();

                const discount = invoice.discount
                  ? (invoice.subtotal - invoice.total) / 100
                  : 0;

                await supabase.from("billing_history").insert({
                  user_id: succUser.id,
                  workspace_id: userSub?.workspace_id || null,
                  stripe_invoice_id: invoice.id,
                  amount: (invoice.amount_paid || 0) / 100,
                  currency: invoice.currency || "usd",
                  status: invoice.status || "paid",
                  description: invoice.lines?.data?.[0]?.description || null,
                  plan_name: userSub?.plan || null,
                  discount_amount: Math.abs(discount),
                  invoice_url: invoice.hosted_invoice_url || null,
                  invoice_pdf: invoice.invoice_pdf || null,
                  period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
                  period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
                });

                // Commission tracking for referred workspaces
                if (userSub?.workspace_id) {
                  const { data: ws } = await supabase
                    .from("workspaces")
                    .select("referred_by_partner_id")
                    .eq("id", userSub.workspace_id)
                    .maybeSingle();

                  if (ws?.referred_by_partner_id) {
                    const { data: partner } = await supabase
                      .from("partner_accounts")
                      .select("id, commission_rate, status")
                      .eq("id", ws.referred_by_partner_id)
                      .maybeSingle();

                    if (partner && partner.status === "active") {
                      await createCommission(
                        partner.id, userSub.workspace_id, subId,
                        userSub.plan || "standard", partner.commission_rate || 10
                      );
                    }
                  }
                }
              }
            }
          }
        }
        break;
      }

      case "checkout.session.completed": {
        // Handle addon purchases
        const session = event.data.object as any;
        if (session.metadata?.addon_type && session.metadata?.user_id) {
          const addonType = session.metadata.addon_type;
          const quantity = Number(session.metadata.addon_quantity) || 0;
          const userId = session.metadata.user_id;

          const mediaType = addonType.startsWith("image") ? "image" : "video";

          // Get user's workspace
          const { data: userSub } = await supabase
            .from("subscriptions")
            .select("workspace_id")
            .eq("user_id", userId)
            .maybeSingle();

          if (userSub?.workspace_id) {
            await supabase.from("media_addons").insert({
              workspace_id: userSub.workspace_id,
              user_id: userId,
              addon_type: mediaType,
              quantity,
              remaining: quantity,
            });
            console.log(`[STRIPE-WEBHOOK] Media addon added: ${quantity} ${mediaType}s for workspace ${userSub.workspace_id}`);
          }
        }
        break;
      }

      case "charge.refunded": {
        // Handle refund → cancel related commission
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;

        if (paymentIntentId) {
          // Find the refund request and update it
          await supabase
            .from("subscription_refunds")
            .update({ refund_status: "processed", updated_at: new Date().toISOString() })
            .eq("payment_intent_id", paymentIntentId)
            .eq("refund_status", "approved");

          // Get workspace from the refund
          const { data: refund } = await supabase
            .from("subscription_refunds")
            .select("workspace_id")
            .eq("payment_intent_id", paymentIntentId)
            .maybeSingle();

          if (refund?.workspace_id) {
            // Cancel pending commissions
            await supabase
              .from("partner_commissions")
              .update({ commission_status: "cancelled" })
              .eq("workspace_id", refund.workspace_id)
              .in("commission_status", ["pending", "pending_refund_window"]);

            // Check for partner abuse
            const { data: ws } = await supabase
              .from("workspaces")
              .select("referred_by_partner_id")
              .eq("id", refund.workspace_id)
              .maybeSingle();

            if (ws?.referred_by_partner_id) {
              await checkPartnerAbuse(ws.referred_by_partner_id);
            }
          }
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
