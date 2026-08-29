import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

const PACKAGE_VARIANTS = [
  { type: "monthly", months: 1, discount: 0 },
  { type: "3-month", months: 3, discount: 5 },
  { type: "6-month", months: 6, discount: 10 },
  { type: "yearly", months: 12, discount: 15 },
] as const;

type PayPalCurrency = "EUR" | "USD";

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const moneyMatches = (a: number, b: number) => Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;

const normalizePayPalCurrency = (value: unknown): PayPalCurrency => {
  if (value === "EUR" || value === "USD") return value;
  throw new Error("PayPal checkout supports EUR or USD only");
};

async function getPayPalAccessToken(clientId: string, secret: string, sandbox: boolean) {
  const base = sandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed: ${text}`);
  }

  const data = await res.json();
  return { token: data.access_token as string, base };
}

async function resolvePlanPurchase(
  supabase: ReturnType<typeof createClient>,
  planKey: unknown,
  currency: PayPalCurrency,
  requestedAmount: number,
) {
  if (typeof planKey !== "string" || !planKey) throw new Error("planKey is required for plan payments");

  const { data: plan, error } = await supabase
    .from("pricing_settings")
    .select("plan_key, plan_label, monthly_price_eur, monthly_price_usd, is_public, is_donation")
    .eq("plan_key", planKey)
    .eq("is_public", true)
    .eq("is_donation", false)
    .maybeSingle();

  if (error) throw error;
  if (!plan) throw new Error("Plan is not available for checkout");

  const baseMonthly = Number(currency === "EUR" ? plan.monthly_price_eur : plan.monthly_price_usd);
  if (!Number.isFinite(baseMonthly) || baseMonthly <= 0) {
    throw new Error(`Plan price is not configured for ${currency}`);
  }

  const candidates = PACKAGE_VARIANTS.map((variant) => ({
    ...variant,
    total: roundMoney(baseMonthly * (1 - variant.discount / 100) * variant.months),
  }));
  const matched = candidates.find((candidate) => moneyMatches(candidate.total, requestedAmount));

  if (!matched) {
    throw new Error("Requested PayPal amount does not match the canonical pricing catalog");
  }

  return {
    planKey: plan.plan_key as string,
    planLabel: (plan.plan_label as string | null) || (plan.plan_key as string),
    packageType: matched.type,
    amount: matched.total,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) throw new Error("Unauthorized");

    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

    const sandbox = Deno.env.get("PAYPAL_SANDBOX") !== "false";
    const body = await req.json();
    const requestedAmount = Number(body?.amount);
    const paymentType = body?.paymentType === "donation" ? "donation" : "one_time";
    const currency = normalizePayPalCurrency(body?.currency ?? "EUR");

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      throw new Error("Valid amount is required");
    }

    let amount = roundMoney(requestedAmount);
    let planKey: string | null = null;
    let packageType: string | null = null;
    let description = "Pulse AI Donation";

    if (paymentType === "one_time") {
      const purchase = await resolvePlanPurchase(supabase, body?.planKey, currency, requestedAmount);
      amount = purchase.amount;
      planKey = purchase.planKey;
      packageType = purchase.packageType;
      description = `Pulse AI - ${purchase.planLabel} (${purchase.packageType})`;
    } else {
      if (amount > 100000) throw new Error("Donation amount exceeds the supported PayPal limit");
      description = typeof body?.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 127)
        : "Pulse AI Donation";
    }

    const { token: ppToken, base } = await getPayPalAccessToken(clientId, clientSecret, sandbox);
    const origin = req.headers.get("origin") || Deno.env.get("PUBLIC_SITE_URL") || "https://pulse-bos.com";

    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: user.id,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
          description,
        },
      ],
      application_context: {
        return_url: `${origin}/complete-payment?provider=paypal&type=${paymentType}`,
        cancel_url: `${origin}/pricing?checkout=canceled&provider=paypal`,
        brand_name: "Pulse AI",
        user_action: "PAY_NOW",
      },
    };

    const orderRes = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ppToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      throw new Error(`PayPal order creation failed: ${errText}`);
    }

    const order = await orderRes.json();
    const approveUrl = order.links?.find((l: any) => l.rel === "approve")?.href;
    if (!order?.id || !approveUrl) throw new Error("PayPal did not return a valid order");

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("workspace_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error: txnError } = await supabase.from("paypal_transactions").insert({
      user_id: user.id,
      workspace_id: sub?.workspace_id ?? null,
      paypal_order_id: order.id,
      amount,
      currency,
      payment_type: paymentType,
      plan_key: planKey,
      status: "pending",
      metadata: {
        description,
        package_type: packageType,
        pricing_source: paymentType === "one_time" ? "pricing_settings" : "user_donation",
      },
    });
    if (txnError) throw txnError;

    return json(req, { orderId: order.id, approveUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("create-paypal-order error:", msg);
    try {
      await supabase.from("webhook_activity_logs").insert({
        source: "paypal",
        event_type: "create_order_error",
        endpoint: "/create-paypal-order",
        status: "error",
        error_message: msg,
      });
    } catch (_) { /* never block */ }
    return json(req, { error: msg }, 500);
  }
});
