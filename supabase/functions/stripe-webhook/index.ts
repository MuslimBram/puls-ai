import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Dynamic product mapping — loaded from DB at runtime
let PRODUCT_MAP: Record<string, string> = {};
let PLAN_PRICES: Record<string, number> = {};

async function loadProductMap(supabase: any) {
  if (Object.keys(PRODUCT_MAP).length > 0) return; // cached for this invocation
  const { data } = await supabase
    .from("stripe_product_plans")
    .select("stripe_product_id, plan_name, monthly_price")
    .eq("is_active", true);
  if (data) {
    for (const row of data) {
      PRODUCT_MAP[row.stripe_product_id] = row.plan_name;
      PLAN_PRICES[row.plan_name] = Number(row.monthly_price);
    }
  }
  // Fallback if table is empty
  if (Object.keys(PRODUCT_MAP).length === 0) {
    PRODUCT_MAP = {
      "prod_U8LrDc0TasNxNH": "standard",
      "prod_U8Qdd9foXaeqnn": "standard",
      "prod_U8Lr5611OwyJSV": "professional",
      "prod_U8LrRodC8eZsTT": "advanced",
      "prod_U8LsXPlxbqhpmK": "enterprise",
    };
    PLAN_PRICES = { standard: 29, professional: 79, advanced: 149, enterprise: 399 };
  }
}

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

    // Load dynamic product mapping
    await loadProductMap(supabase);

    const findUserByEmail = async (email: string) => {
      const { data: users } = await supabase.auth.admin.listUsers();
      return users?.users?.find((u) => u.email === email) || null;
    };

    // Get partner info for a workspace
    const getPartnerDiscount = async (workspaceId: string) => {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("referred_by_partner_id")
        .eq("id", workspaceId)
        .maybeSingle();

      if (!ws?.referred_by_partner_id) return null;

      const { data: partner } = await supabase
        .from("partner_accounts")
        .select("id, referral_discount_percent, discount_duration_months, status")
        .eq("id", ws.referred_by_partner_id)
        .eq("status", "active")
        .maybeSingle();

      return partner;
    };

    // Apply or renew referral discount on a Stripe subscription
    const applyReferralDiscount = async (
      stripeSubscriptionId: string,
      userId: string,
      workspaceId: string,
      invoiceAmount: number
    ) => {
      // Get current sub discount tracking
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("referral_discount_percent, referral_discount_months_remaining, referral_discount_expires_at, referred_by_partner_id, total_discount_savings")
        .eq("user_id", userId)
        .maybeSingle();

      if (!sub) return;

      // Check if discount is still active
      const now = new Date();
      const hasActiveDiscount = sub.referral_discount_months_remaining > 0 &&
        sub.referral_discount_expires_at &&
        new Date(sub.referral_discount_expires_at) > now;

      if (hasActiveDiscount && sub.referral_discount_percent > 0) {
        // Decrement months remaining
        const newMonthsRemaining = sub.referral_discount_months_remaining - 1;
        const discountSaved = (invoiceAmount * sub.referral_discount_percent) / 100;

        const updateData: Record<string, any> = {
          referral_discount_months_remaining: newMonthsRemaining,
          total_discount_savings: Number(sub.total_discount_savings || 0) + discountSaved,
          updated_at: now.toISOString(),
        };

        // If months exhausted, clear the discount
        if (newMonthsRemaining <= 0) {
          updateData.referral_discount_percent = 0;
          updateData.referral_discount_expires_at = null;

          // Remove Stripe coupon from subscription
          try {
            await stripe.subscriptions.update(stripeSubscriptionId, {
              coupon: "",
            });
            console.log(`[STRIPE-WEBHOOK] Removed expired referral discount from sub ${stripeSubscriptionId}`);
          } catch (e) {
            console.error("[STRIPE-WEBHOOK] Failed to remove coupon:", e);
          }
        }

        await supabase.from("subscriptions").update(updateData).eq("user_id", userId);
        console.log(`[STRIPE-WEBHOOK] Discount tracked: saved $${discountSaved.toFixed(2)}, ${newMonthsRemaining} months remaining`);
      }
    };

    // Initialize referral discount for new subscription
    const initializeReferralDiscount = async (userId: string, workspaceId: string) => {
      const partner = await getPartnerDiscount(workspaceId);
      if (!partner || partner.referral_discount_percent <= 0) return;

      const durationMonths = partner.discount_duration_months || 3;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

      // Anti-abuse: check self-referral
      const { data: partnerAccount } = await supabase
        .from("partner_accounts")
        .select("user_id")
        .eq("id", partner.id)
        .maybeSingle();

      if (partnerAccount?.user_id === userId) {
        console.log(`[STRIPE-WEBHOOK] Self-referral blocked for user ${userId}`);
        return;
      }

      // Anti-abuse: check duplicate email domain
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const userEmail = userData?.user?.email;
      if (userEmail && partnerAccount?.user_id) {
        const { data: partnerUser } = await supabase.auth.admin.getUserById(partnerAccount.user_id);
        if (partnerUser?.user?.email) {
          const userDomain = userEmail.split("@")[1];
          const partnerDomain = partnerUser.user.email.split("@")[1];
          // Block same domain (except public email providers)
          const publicDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "protonmail.com"];
          if (userDomain === partnerDomain && !publicDomains.includes(userDomain)) {
            console.log(`[STRIPE-WEBHOOK] Same-domain referral blocked: ${userDomain}`);
            return;
          }
        }
      }

      await supabase.from("subscriptions").update({
        referral_discount_percent: partner.referral_discount_percent,
        referral_discount_months_remaining: durationMonths,
        referral_discount_expires_at: expiresAt.toISOString(),
        referred_by_partner_id: partner.id,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);

      console.log(`[STRIPE-WEBHOOK] Initialized referral discount: ${partner.referral_discount_percent}% for ${durationMonths} months`);
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

      const { data: existing } = await supabase
        .from("partner_commissions")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("workspace_id", workspaceId)
        .gte("billing_period_start", periodStart.toISOString())
        .maybeSingle();

      if (existing) return;

      const { data: partnerConfig } = await supabase
        .from("partner_accounts")
        .select("refund_window_days")
        .eq("id", partnerId)
        .maybeSingle();

      const refundWindowDays = partnerConfig?.refund_window_days ?? REFUND_WINDOW_DAYS;

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

      console.log(`[STRIPE-WEBHOOK] Commission created: $${commAmount} for partner ${partnerId}`);
    };

    const checkPartnerAbuse = async (partnerId: string) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscription(subscription);

        // Initialize referral discount for new subscriptions
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
                await initializeReferralDiscount(user.id, sub.workspace_id);
              }
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscription(subscription);

        // On plan change (upgrade/downgrade), preserve the referral discount
        const prevAttrs = (event.data as any).previous_attributes;
        if (prevAttrs?.items) {
          const customerId = subscription.customer as string;
          const customer = await stripe.customers.retrieve(customerId);
          if (!(customer as any).deleted) {
            const email = (customer as Stripe.Customer).email;
            if (email) {
              const user = await findUserByEmail(email);
              if (user) {
                const { data: sub } = await supabase
                  .from("subscriptions")
                  .select("referral_discount_percent, referral_discount_months_remaining, workspace_id")
                  .eq("user_id", user.id)
                  .maybeSingle();

                // If they have an active discount, re-apply coupon to new plan
                if (sub && sub.referral_discount_percent > 0 && sub.referral_discount_months_remaining > 0) {
                  try {
                    const coupon = await stripe.coupons.create({
                      percent_off: Number(sub.referral_discount_percent),
                      duration: sub.referral_discount_months_remaining > 1 ? "repeating" : "once",
                      duration_in_months: sub.referral_discount_months_remaining > 1 ? sub.referral_discount_months_remaining : undefined,
                      name: `Referral Discount (${sub.referral_discount_percent}%)`,
                    });
                    await stripe.subscriptions.update(subscription.id, {
                      coupon: coupon.id,
                    });
                    console.log(`[STRIPE-WEBHOOK] Re-applied referral discount on plan change`);
                  } catch (e) {
                    console.error("[STRIPE-WEBHOOK] Failed to re-apply coupon on plan change:", e);
                  }
                }
              }
            }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscription(subscription);

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
                await supabase
                  .from("partner_commissions")
                  .update({ commission_status: "cancelled" })
                  .eq("workspace_id", sub.workspace_id)
                  .in("commission_status", ["pending", "pending_refund_window"]);
              }

              // Clear active discount on cancellation
              await supabase.from("subscriptions").update({
                referral_discount_percent: 0,
                referral_discount_months_remaining: 0,
                referral_discount_expires_at: null,
              }).eq("user_id", user.id);
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
                message: `Your payment of $${((invoice.amount_due || 0) / 100).toFixed(2)} failed. Please update your payment method.`,
                severity: "critical",
                metadata: { invoice_id: invoice.id, amount: invoice.amount_due },
              });

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

                // Track referral discount usage on each renewal
                if (userSub?.workspace_id) {
                  const invoiceAmountUsd = (invoice.amount_paid || 0) / 100;
                  await applyReferralDiscount(subId, succUser.id, userSub.workspace_id, invoiceAmountUsd);

                  // Commission tracking for referred workspaces
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
        const session = event.data.object as any;
        if (session.metadata?.addon_type && session.metadata?.user_id) {
          const addonType = session.metadata.addon_type;
          const quantity = Number(session.metadata.addon_quantity) || 0;
          const userId = session.metadata.user_id;

          const mediaType = addonType.startsWith("image") ? "image" : "video";

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
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;

        if (paymentIntentId) {
          await supabase
            .from("subscription_refunds")
            .update({ refund_status: "processed", updated_at: new Date().toISOString() })
            .eq("payment_intent_id", paymentIntentId)
            .eq("refund_status", "approved");

          const { data: refund } = await supabase
            .from("subscription_refunds")
            .select("workspace_id")
            .eq("payment_intent_id", paymentIntentId)
            .maybeSingle();

          if (refund?.workspace_id) {
            await supabase
              .from("partner_commissions")
              .update({ commission_status: "cancelled" })
              .eq("workspace_id", refund.workspace_id)
              .in("commission_status", ["pending", "pending_refund_window"]);

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
