import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

import { indexPlanPrices, indexPricingCatalogByProductId, loadPricingCatalogRows } from "../_shared/monetization-catalog.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

let PRODUCT_MAP: Record<string, string> = {};
let PLAN_PRICES: Record<string, number> = {};
let _catalogLoadedAt = 0;
const CATALOG_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadProductMap(supabase: ReturnType<typeof createClient>) {
  if (Object.keys(PRODUCT_MAP).length > 0 && Date.now() - _catalogLoadedAt < CATALOG_TTL_MS) return;

  const rows = await loadPricingCatalogRows(supabase);
  PRODUCT_MAP = indexPricingCatalogByProductId(rows);
  PLAN_PRICES = indexPlanPrices(rows);
  _catalogLoadedAt = Date.now();
}

const GRACE_PERIOD_DAYS = 7;

async function notifyBrain(sb: ReturnType<typeof createClient>, opts: {
  workspace_id: string; lead_id?: string; event_type: string;
  channel?: string; broadcast_id?: string; event_data?: Record<string,unknown>;
}): Promise<void> {
  if (!opts.lead_id) return;
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getServiceKey()}`,
        "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
      },
      body: JSON.stringify({
        action: "feedback",
        workspace_id: opts.workspace_id,
        lead_id: opts.lead_id,
        event_type: opts.event_type,
        channel: opts.channel,
        broadcast_id: opts.broadcast_id,
        event_data: opts.event_data ?? {},
      }),
    });
  } catch { /* non-critical */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey) return new Response("Missing STRIPE_SECRET_KEY", { status: 500 });

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    getServiceKey() ?? "",
    { auth: { persistSession: false } }
  );

  let idempotencyKey: string | null = null;

  try {
    const body = await req.text();
    let event: Stripe.Event;

    if (!webhookSecret) {
      console.error("[STRIPE-WEBHOOK] STRIPE_WEBHOOK_SECRET is not configured — refusing to process event");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Missing stripe-signature", { status: 400 });
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (sigErr: unknown) {
      const msg = sigErr instanceof Error ? sigErr.message : "Unknown";
      console.error("[STRIPE-WEBHOOK] Invalid signature:", msg);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[STRIPE-WEBHOOK] Event: ${event.type}, ID: ${event.id}`);

    // ATOMIC IDEMPOTENCY CLAIM BEFORE ANY SIDE EFFECTS
    idempotencyKey = `stripe:event:${event.id}`;
    const { error: claimErr } = await supabase.from("integration_event_logs").insert({
      adapter_key: "stripe",
      event_type: event.type,
      idempotency_key: idempotencyKey,
      status: "processing",
      metadata: { event_id: event.id, created: event.created },
    });

    if (claimErr) {
      if (claimErr.code === "23505" || String(claimErr.message || "").includes("duplicate") || String(claimErr.message || "").includes("unique")) {
        console.log(`[STRIPE-WEBHOOK] Duplicate event ${event.id} claimed already. Returning 200 OK.`);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }
      throw claimErr;
    }

    // Load dynamic product mapping
    await loadProductMap(supabase);

    const findUserByEmail = async (email: string) => {
      const { data: users } = await supabase.auth.admin.listUsers();
      return users?.users?.find((u) => u.email === email) || null;
    };

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

    const applyReferralDiscount = async (
      stripeSubscriptionId: string,
      userId: string,
      workspaceId: string,
      invoiceAmount: number
    ) => {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("referral_discount_percent, referral_discount_months_remaining, referral_discount_expires_at, referred_by_partner_id, total_discount_savings")
        .eq("user_id", userId)
        .maybeSingle();

      if (!sub) return;

      const now = new Date();
      const hasActiveDiscount = sub.referral_discount_months_remaining > 0 &&
        sub.referral_discount_expires_at &&
        new Date(sub.referral_discount_expires_at) > now;

      if (hasActiveDiscount && sub.referral_discount_percent > 0) {
        const newMonthsRemaining = sub.referral_discount_months_remaining - 1;
        const discountSaved = (invoiceAmount * sub.referral_discount_percent) / 100;

        const updateData: Record<string, unknown> = {
          referral_discount_months_remaining: newMonthsRemaining,
          total_discount_savings: Number(sub.total_discount_savings || 0) + discountSaved,
          updated_at: now.toISOString(),
        };

        if (newMonthsRemaining <= 0) {
          updateData.referral_discount_percent = 0;
          updateData.referral_discount_expires_at = null;

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

    const initializeReferralDiscount = async (userId: string, workspaceId: string) => {
      const partner = await getPartnerDiscount(workspaceId);
      if (!partner || partner.referral_discount_percent <= 0) return;

      const durationMonths = partner.discount_duration_months || 3;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

      const { data: partnerAccount } = await supabase
        .from("partner_accounts")
        .select("user_id")
        .eq("id", partner.id)
        .maybeSingle();

      if (partnerAccount?.user_id === userId) {
        console.log(`[STRIPE-WEBHOOK] Self-referral blocked for user ${userId}`);
        return;
      }

      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const userEmail = userData?.user?.email;
      if (userEmail && partnerAccount?.user_id) {
        const { data: partnerUser } = await supabase.auth.admin.getUserById(partnerAccount.user_id);
        if (partnerUser?.user?.email) {
          const userDomain = userEmail.split("@")[1];
          const partnerDomain = partnerUser.user.email.split("@")[1];
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

    const handleSubscription = async (subscription: Stripe.Subscription, providerEventId?: string) => {
      const customerId = subscription.customer as string;
      const customer = await stripe.customers.retrieve(customerId);
      if ((customer as Record<string, unknown>).deleted) return;

      const email = (customer as Stripe.Customer).email;
      if (!email) return;

      const user = await findUserByEmail(email);
      if (!user) return;

      const metadataWorkspaceId = typeof subscription.metadata?.workspace_id === "string"
        ? subscription.metadata.workspace_id
        : null;
      const { data: storedSubscription, error: storedSubscriptionError } = await supabase
        .from("subscriptions")
        .select("workspace_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (storedSubscriptionError) throw storedSubscriptionError;
      if (metadataWorkspaceId && storedSubscription?.workspace_id && metadataWorkspaceId !== storedSubscription.workspace_id) {
        throw new Error("Stripe workspace metadata mismatch");
      }
      const workspaceId = metadataWorkspaceId ?? storedSubscription?.workspace_id ?? null;

      const productId = subscription.items.data[0]?.price?.product as string;
      const metadataPlan = typeof subscription.metadata?.plan_key === "string" ? subscription.metadata.plan_key : null;
      const plan = PRODUCT_MAP[productId] || metadataPlan || "standard";
      const status = subscription.status;

      const packageType = typeof subscription.metadata?.package_type === "string" ? subscription.metadata.package_type : "monthly";
      const commitmentMonths = Number(subscription.metadata?.commitment_months || 1);
      const packageStartAt = subscription.trial_start
        ? new Date(subscription.trial_start * 1000).toISOString()
        : new Date(subscription.current_period_start * 1000).toISOString();
      const packageEndAt = subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : new Date(subscription.current_period_end * 1000).toISOString();

      const updateData: Record<string, unknown> = {
        plan: ["active", "trialing"].includes(status) ? plan : "standard",
        payment_status: status === "active" ? "paid" : status === "trialing" ? "trial" : status === "past_due" ? "past_due" : "unpaid",
        subscription_status: status,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        billing_cycle_start: new Date(subscription.current_period_start * 1000).toISOString(),
        package_type: packageType,
        qualifying_package_type: ["3-month", "6-month"].includes(packageType) ? packageType : null,
        package_start_at: packageStartAt,
        package_end_at: packageEndAt,
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
      if (error) throw error;

      const lifecycleAction = ["canceled", "unpaid"].includes(status)
        ? "cancel"
        : status === "past_due"
          ? "grace"
          : ["active", "trialing"].includes(status)
            ? "activate"
            : null;

      if (workspaceId && providerEventId && lifecycleAction) {
        const validUntil = lifecycleAction === "grace"
          ? String(updateData.grace_period_end)
          : lifecycleAction === "activate"
            ? status === "trialing" && subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : packageEndAt
            : null;
        const { error: entitlementError } = await supabase.rpc("leah_apply_billing_entitlement_event", {
          _workspace_id: workspaceId,
          _provider: "stripe",
          _provider_event_id: providerEventId,
          _action: lifecycleAction,
          _valid_until: validUntil,
          _provider_subscription_ref: subscription.id,
          _provider_customer_ref: customerId,
          _metadata: {
            event_type: "stripe_subscription",
            subscription_status: status,
            plan_key: plan,
            package_type: packageType,
          },
        });
        if (entitlementError) throw entitlementError;
      } else if (workspaceId && providerEventId) {
        console.log("[STRIPE-WEBHOOK] Status " + status + " does not change LEAH entitlement");
      } else {
        console.warn("[STRIPE-WEBHOOK] Subscription has no workspace binding; LEAH entitlement was not changed");
      }

      console.log(`[STRIPE-WEBHOOK] Updated user ${user.id} to plan=${updateData.plan}, status=${status}, term=${commitmentMonths}m`);
    };

    const createCommission = async (
      partnerId: string, workspaceId: string, subId: string,
      planName: string, commRate: number,
      invoiceRef?: string | null, paidAmount?: number | null,
    ) => {
      const { data: existingFirst } = await supabase
        .from("partner_commissions")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("workspace_id", workspaceId)
        .eq("is_first_payment", true)
        .maybeSingle();

      if (existingFirst) {
        console.log(`[STRIPE-WEBHOOK] Commission skipped (not first payment) ws=${workspaceId}`);
        return;
      }

      const grossAmount = Number(paidAmount) > 0
        ? Number(paidAmount)
        : (PLAN_PRICES[planName] || 0);
      if (grossAmount === 0) return;

      const commAmount = (grossAmount * commRate) / 100;
      const nowIso = new Date().toISOString();

      const { error: insertErr } = await supabase.from("partner_commissions").insert({
        partner_id: partnerId,
        workspace_id: workspaceId,
        subscription_id: subId,
        plan_name: planName,
        billing_period_start: nowIso,
        billing_period_end: nowIso,
        gross_amount: grossAmount,
        commission_percent: commRate,
        commission_amount: commAmount,
        commission_status: "pending_refund_window",
        is_first_payment: true,
        source_invoice_id: invoiceRef || null,
      });

      if (insertErr) {
        if (!String(insertErr.message || "").includes("duplicate")) {
          console.error(`[STRIPE-WEBHOOK] Commission insert failed:`, insertErr);
        }
        return;
      }

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
            updated_at: nowIso,
          })
          .eq("partner_id", partnerId);
      }

      console.log(`[STRIPE-WEBHOOK] First-payment commission created: $${commAmount} for partner ${partnerId}`);
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
        await handleSubscription(subscription, event.id);

        const customerId = subscription.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        if (!(customer as Record<string, unknown>).deleted) {
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
        await handleSubscription(subscription, event.id);

        const prevAttrs = (event.data as Record<string, unknown>).previous_attributes as Record<string, unknown> | undefined;
        if (prevAttrs?.items) {
          const customerId = subscription.customer as string;
          const customer = await stripe.customers.retrieve(customerId);
          if (!(customer as Record<string, unknown>).deleted) {
            const email = (customer as Stripe.Customer).email;
            if (email) {
              const user = await findUserByEmail(email);
              if (user) {
                const { data: sub } = await supabase
                  .from("subscriptions")
                  .select("referral_discount_percent, referral_discount_months_remaining, workspace_id")
                  .eq("user_id", user.id)
                  .maybeSingle();

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
        await handleSubscription(subscription, event.id);

        const customerId = subscription.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        if (!(customer as Record<string, unknown>).deleted) {
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
          await handleSubscription(subscription, event.id);
        }

        const failCustomerId = invoice.customer as string;
        const failCustomer = await stripe.customers.retrieve(failCustomerId);
        if (!(failCustomer as Record<string, unknown>).deleted) {
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
          await handleSubscription(subscription, event.id);

          const succCustomerId = invoice.customer as string;
          const succCustomer = await stripe.customers.retrieve(succCustomerId);
          if (!(succCustomer as Record<string, unknown>).deleted) {
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

                if (userSub?.workspace_id) {
                  const invoiceAmountUsd = (invoice.amount_paid || 0) / 100;
                  await applyReferralDiscount(subId, succUser.id, userSub.workspace_id, invoiceAmountUsd);

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
                        userSub.plan || "standard", Number(partner.commission_rate ?? 0)
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
        const session = event.data?.object as Record<string, unknown> | undefined;
        const customerDetails = session?.customer_details as Record<string, unknown> | undefined;
        const customerEmail = (customerDetails?.email as string) ?? (session?.customer_email as string);
        if (customerEmail) {
          const { data: lead } = await supabase
            .from("leads").select("id,workspace_id")
            .eq("contact_identifier", customerEmail).maybeSingle();
          if (lead) {
            await notifyBrain(supabase, {
              workspace_id: lead.workspace_id, lead_id: lead.id,
              event_type: "purchased", channel: "stripe",
              event_data: { stripe_session_id: session?.id, amount_total: session?.amount_total },
            });
          }
        }

        const metadata = session?.metadata as Record<string, unknown> | undefined;
        if (metadata?.addon_type && metadata?.user_id) {
          const addonType = metadata.addon_type as string;
          const quantity = Number(metadata.addon_quantity) || 0;
          const userId = metadata.user_id as string;

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

    if (idempotencyKey) await supabase.from("integration_event_logs").update({ status: "success" }).eq("idempotency_key", idempotencyKey);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown";
    if (idempotencyKey) {
      await supabase.from("integration_event_logs").update({ status: "failed" }).eq("idempotency_key", idempotencyKey);
    }
    console.error("[STRIPE-WEBHOOK] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
