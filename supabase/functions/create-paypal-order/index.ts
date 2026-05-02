import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

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

  const data = await res.json(req);
  return { token: data.access_token as string, base };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData.user;
    if (!user) throw new Error("Unauthorized");

    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

    const sandbox = Deno.env.get("PAYPAL_SANDBOX") !== "false";

    const body = await req.json(req);
    const { amount, currency = "USD", paymentType = "one_time", planKey, description } = body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error("Valid amount is required");
    }

    const { token: ppToken, base } = await getPayPalAccessToken(clientId, clientSecret, sandbox);
    const origin = req.headers.get("origin") || "https://pulsi.lovable.app";

    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: Number(amount).toFixed(2),
          },
          description: description || (paymentType === "donation" ? "Pulse AI Donation" : `Pulse AI - ${planKey || "Payment"}`),
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

    const order = await orderRes.json(req);
    const approveUrl = order.links?.find((l: any) => l.rel === "approve")?.href;

    // Get workspace
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("workspace_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Save transaction
    await supabase.from("paypal_transactions").insert({
      user_id: user.id,
      workspace_id: sub?.workspace_id ?? null,
      paypal_order_id: order.id,
      amount: Number(amount),
      currency,
      payment_type: paymentType,
      plan_key: planKey ?? null,
      status: "pending",
      metadata: { description },
    });

    return json(req, { orderId: order.id, approveUrl });
  } catch (error) {
    console.error("create-paypal-order error:", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
