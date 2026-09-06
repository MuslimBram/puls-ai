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

const PACKAGE_MONTHS: Record<string, number> = {
  monthly: 1,
  "3-month": 3,
  "6-month": 6,
  yearly: 12,
};

const roundMoney = (value: unknown) => Math.round(Number(value) * 100) / 100;
const sameMoney = (actual: unknown, expected: unknown) =>
  Number.isFinite(Number(actual)) && Number.isFinite(Number(expected)) &&
  Math.abs(roundMoney(actual) - roundMoney(expected)) < 0.005;

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

  if (!res.ok) throw new Error("PayPal auth failed");
  const data = await res.json();
  return { token: data.access_token as string, base };
}

function assertOrderMoney(order: any, expectedAmount: number, expectedCurrency: string) {
  const amount = order?.purchase_units?.[0]?.amount;
  if (!amount || amount.currency_code !== expectedCurrency || !sameMoney(amount.value, expectedAmount)) {
    throw new Error("PayPal order amount/currency does not match the stored transaction");
  }
}

function assertCaptureMoney(capture: any, expectedAmount: number, expectedCurrency: string) {
  const amount = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
  if (!amount || amount.currency_code !== expectedCurrency || !sameMoney(amount.value, expectedAmount)) {
    throw new Error("PayPal captured amount/currency does not match the stored transaction");
  }
}

function packageWindow(packageType: string, anchorIso: string) {
  const months = PACKAGE_MONTHS[packageType];
  if (!months) throw new Error("Stored PayPal package type is invalid");
  const start = new Date(anchorIso);
  if (Number.isNaN(start.getTime())) throw new Error("Stored PayPal package start is invalid");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fulfillPlanPurchase(
  supabase: ReturnType<typeof createClient>,
  txn: any,
  userId: string,
  completedAt: string,
) {
  if (txn.payment_type === "donation") return;
  if (typeof txn.plan_key !== "string" || !txn.plan_key) {
    throw new Error("Verified PayPal plan payment is missing plan identity");
  }
  if (!txn.workspace_id) {
    throw new Error("Verified PayPal plan payment is missing workspace identity");
  }

  const packageType = typeof txn.metadata?.package_type === "string"
    ? txn.metadata.package_type
    : "";
  const window = packageWindow(packageType, completedAt);

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("workspace_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.workspace_id && existing.workspace_id !== txn.workspace_id) {
    throw new Error("PayPal transaction workspace does not match the user's subscription workspace");
  }

  const { error: fulfillError } = await supabase
    .from("subscriptions")
    .upsert({
      user_id: userId,
      workspace_id: txn.workspace_id,
      plan: txn.plan_key,
      payment_status: "paid",
      subscription_status: "active",
      package_type: packageType,
      qualifying_package_type: ["3-month", "6-month"].includes(packageType) ? packageType : null,
      package_start_at: window.start,
      package_end_at: window.end,
      billing_cycle_start: window.start,
      grace_period_end: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (fulfillError) throw fulfillError;
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

    const body = await req.json();
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    if (!orderId) throw new Error("orderId is required");

    const { data: txn, error: txnError } = await supabase
      .from("paypal_transactions")
      .select("user_id, workspace_id, amount, currency, payment_type, plan_key, status, paypal_capture_id, metadata, created_at")
      .eq("paypal_order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (txnError) throw txnError;
    if (!txn) return json(req, { error: "PayPal order does not belong to the authenticated user" }, 403);

    const expectedAmount = Number(txn.amount);
    const expectedCurrency = String(txn.currency);
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0 || !expectedCurrency) {
      throw new Error("Stored PayPal transaction is invalid");
    }

    // New-code completed rows have already passed fulfillment + billing because local
    // completion is the final side effect in persistCompleted().
    if (txn.status === "completed" && txn.paypal_capture_id) {
      return json(req, {
        status: "COMPLETED",
        captureId: txn.paypal_capture_id,
        alreadyCaptured: true,
      });
    }

    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

    const sandbox = Deno.env.get("PAYPAL_SANDBOX") !== "false";
    const { token: ppToken, base } = await getPayPalAccessToken(clientId, clientSecret, sandbox);

    const orderCheckRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${ppToken}` },
    });
    if (!orderCheckRes.ok) throw new Error("Failed to verify order with PayPal");

    const orderCheck = await orderCheckRes.json();
    assertOrderMoney(orderCheck, expectedAmount, expectedCurrency);

    const customId = orderCheck?.purchase_units?.[0]?.custom_id;
    if (customId && customId !== user.id) {
      throw new Error("PayPal order ownership metadata does not match the authenticated user");
    }

    const updateOwnedTxn = (payload: Record<string, unknown>) =>
      supabase.from("paypal_transactions")
        .update(payload)
        .eq("paypal_order_id", orderId)
        .eq("user_id", user.id);

    const persistCompleted = async (verified: any, alreadyCaptured: boolean) => {
      assertCaptureMoney(verified, expectedAmount, expectedCurrency);
      const capture = verified.purchase_units?.[0]?.payments?.captures?.[0];
      const captureId = capture?.id;
      if (!captureId) throw new Error("Verified PayPal completion is missing capture id");
      const payer = verified.payer;
      const completedAt = typeof capture?.create_time === "string" ? capture.create_time : txn.created_at;

      // Deterministic fulfillment first. If anything below fails, the local transaction
      // remains pending and a retry resumes from PayPal's already-COMPLETED order.
      await fulfillPlanPurchase(supabase, txn, user.id, completedAt);

      if (txn.payment_type !== "donation" && txn.workspace_id) {
        const packageType = typeof txn.metadata?.package_type === "string" ? txn.metadata.package_type : "";
        const entitlementWindow = packageWindow(packageType, completedAt);
        const { error: entitlementError } = await supabase.rpc("leah_apply_billing_entitlement_event", {
          _workspace_id: txn.workspace_id,
          _provider: "paypal",
          _provider_event_id: `capture:${captureId}`,
          _action: "activate",
          _valid_until: entitlementWindow.end,
          _provider_subscription_ref: orderId,
          _provider_customer_ref: payer?.payer_id ?? null,
          _metadata: {
            order_id: orderId,
            capture_id: captureId,
            plan_key: txn.plan_key,
            package_type: packageType,
          },
        });
        if (entitlementError) throw entitlementError;
      }

      const { data: existingBill, error: billLookupError } = await supabase
        .from("billing_history")
        .select("id")
        .eq("stripe_invoice_id", `paypal_${captureId}`)
        .maybeSingle();
      if (billLookupError) throw billLookupError;

      if (!existingBill) {
        const { error: billError } = await supabase.from("billing_history").insert({
          user_id: user.id,
          workspace_id: txn.workspace_id ?? null,
          amount: expectedAmount,
          currency: expectedCurrency,
          charged_amount: expectedAmount,
          charged_currency: expectedCurrency,
          status: "paid",
          payment_method: "paypal",
          description: txn.payment_type === "donation"
            ? "PayPal Donation"
            : `PayPal Payment${txn.plan_key ? ` - ${txn.plan_key}` : ""}`,
          plan_name: txn.plan_key ?? null,
          stripe_invoice_id: `paypal_${captureId}`,
        });
        if (billError) throw billError;
      }

      // Completion is intentionally LAST: it is the idempotency marker that means
      // entitlement + billing side effects have already succeeded.
      const { error: completeError } = await updateOwnedTxn({
        status: "completed",
        paypal_capture_id: captureId,
        paypal_payer_id: payer?.payer_id ?? null,
        payer_email: payer?.email_address ?? null,
        payer_name: payer?.name
          ? `${payer.name.given_name ?? ""} ${payer.name.surname ?? ""}`.trim()
          : null,
        updated_at: new Date().toISOString(),
      });
      if (completeError) throw completeError;

      return json(req, { status: "COMPLETED", captureId, alreadyCaptured });
    };

    if (orderCheck.status === "COMPLETED") {
      return await persistCompleted(orderCheck, true);
    }

    if (orderCheck.status !== "APPROVED") {
      if (orderCheck.status === "VOIDED" || orderCheck.status === "EXPIRED") {
        await updateOwnedTxn({ status: "failed", updated_at: new Date().toISOString() });
      }
      throw new Error(`Order not approved (status: ${orderCheck.status})`);
    }

    const captureRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ppToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!captureRes.ok) {
      if (captureRes.status === 422) {
        const recheck = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${ppToken}` },
        });
        if (recheck.ok) {
          const recheckData = await recheck.json();
          assertOrderMoney(recheckData, expectedAmount, expectedCurrency);
          if (recheckData.status === "COMPLETED") {
            return await persistCompleted(recheckData, true);
          }
        }
      }

      await updateOwnedTxn({ status: "failed", updated_at: new Date().toISOString() });
      const errText = await captureRes.text();
      throw new Error(`PayPal capture failed: ${errText}`);
    }

    const capture = await captureRes.json();
    if (capture.status !== "COMPLETED") {
      await updateOwnedTxn({ status: "failed", updated_at: new Date().toISOString() });
      throw new Error(`PayPal capture did not complete (status: ${capture.status})`);
    }

    return await persistCompleted(capture, false);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[capture-paypal] Error:", msg);
    try {
      await supabase.from("webhook_activity_logs").insert({
        source: "paypal",
        event_type: "capture_order_error",
        endpoint: "/capture-paypal-order",
        status: "error",
        error_message: msg,
      });
    } catch (_) { /* never block */ }
    return json(req, { error: msg }, 500);
  }
});
