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

    // Ownership is established from our own pending transaction record, never from PayPal/browser metadata.
    const { data: txn, error: txnError } = await supabase
      .from("paypal_transactions")
      .select("user_id, workspace_id, amount, currency, payment_type, plan_key, status, paypal_capture_id")
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

    if (orderCheck.status === "COMPLETED") {
      assertCaptureMoney(orderCheck, expectedAmount, expectedCurrency);
      const captureId = orderCheck.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      const payer = orderCheck.payer;
      await updateOwnedTxn({
        status: "completed",
        paypal_capture_id: captureId ?? null,
        paypal_payer_id: payer?.payer_id ?? null,
        payer_email: payer?.email_address ?? null,
        payer_name: payer?.name
          ? `${payer.name.given_name ?? ""} ${payer.name.surname ?? ""}`.trim()
          : null,
        updated_at: new Date().toISOString(),
      });
      return json(req, { status: "COMPLETED", captureId, alreadyCaptured: true });
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
            assertCaptureMoney(recheckData, expectedAmount, expectedCurrency);
            const cId = recheckData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
            await updateOwnedTxn({
              status: "completed",
              paypal_capture_id: cId ?? null,
              updated_at: new Date().toISOString(),
            });
            return json(req, { status: "COMPLETED", captureId: cId, alreadyCaptured: true });
          }
        }
      }

      await updateOwnedTxn({ status: "failed", updated_at: new Date().toISOString() });
      const errText = await captureRes.text();
      throw new Error(`PayPal capture failed: ${errText}`);
    }

    const capture = await captureRes.json();
    assertCaptureMoney(capture, expectedAmount, expectedCurrency);
    const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const payer = capture.payer;
    const finalStatus = capture.status === "COMPLETED" ? "completed" : "failed";

    await updateOwnedTxn({
      status: finalStatus,
      paypal_capture_id: captureId ?? null,
      paypal_payer_id: payer?.payer_id ?? null,
      payer_email: payer?.email_address ?? null,
      payer_name: payer?.name
        ? `${payer.name.given_name ?? ""} ${payer.name.surname ?? ""}`.trim()
        : null,
      updated_at: new Date().toISOString(),
    });

    if (capture.status === "COMPLETED" && captureId) {
      const { data: existingBill } = await supabase
        .from("billing_history")
        .select("id")
        .eq("stripe_invoice_id", `paypal_${captureId}`)
        .maybeSingle();

      if (!existingBill) {
        await supabase.from("billing_history").insert({
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
      }
    }

    return json(req, {
      status: capture.status,
      captureId,
      payerEmail: payer?.email_address,
    });
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
