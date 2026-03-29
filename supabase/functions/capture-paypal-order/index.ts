import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

  if (!res.ok) throw new Error("PayPal auth failed");
  const data = await res.json();
  return { token: data.access_token as string, base };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const body = await req.json();
    const { orderId } = body;

    if (!orderId) throw new Error("orderId is required");

    console.log(`[capture-paypal] Starting capture for order: ${orderId}, user: ${user.id}`);

    // IDEMPOTENCY: Check if already captured
    const { data: existingTxn } = await supabase
      .from("paypal_transactions")
      .select("status, paypal_capture_id")
      .eq("paypal_order_id", orderId)
      .maybeSingle();

    if (existingTxn?.status === "completed" && existingTxn?.paypal_capture_id) {
      console.log(`[capture-paypal] Order ${orderId} already captured, returning existing`);
      return json({
        status: "COMPLETED",
        captureId: existingTxn.paypal_capture_id,
        alreadyCaptured: true,
      });
    }

    const { token: ppToken, base } = await getPayPalAccessToken(clientId, clientSecret, sandbox);

    // SERVER-SIDE VERIFICATION: Check order status before capture
    const orderCheckRes = await fetch(`${base}/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${ppToken}` },
    });

    if (!orderCheckRes.ok) {
      const errText = await orderCheckRes.text();
      console.error(`[capture-paypal] Order check failed: ${errText}`);
      throw new Error("Failed to verify order with PayPal");
    }

    const orderCheck = await orderCheckRes.json();
    console.log(`[capture-paypal] Order ${orderId} status: ${orderCheck.status}`);

    // If already captured, sync the status
    if (orderCheck.status === "COMPLETED") {
      const captureId = orderCheck.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      const payer = orderCheck.payer;

      await supabase.from("paypal_transactions")
        .update({
          status: "completed",
          paypal_capture_id: captureId ?? null,
          paypal_payer_id: payer?.payer_id ?? null,
          payer_email: payer?.email_address ?? null,
          payer_name: payer?.name
            ? `${payer.name.given_name ?? ""} ${payer.name.surname ?? ""}`.trim()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("paypal_order_id", orderId);

      return json({ status: "COMPLETED", captureId, alreadyCaptured: true });
    }

    if (orderCheck.status !== "APPROVED") {
      console.error(`[capture-paypal] Order not in APPROVED state: ${orderCheck.status}`);

      // Mark as failed if not approved
      if (orderCheck.status === "VOIDED" || orderCheck.status === "EXPIRED") {
        await supabase.from("paypal_transactions")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("paypal_order_id", orderId);
      }

      throw new Error(`Order not approved (status: ${orderCheck.status})`);
    }

    // Capture the order
    console.log(`[capture-paypal] Capturing order ${orderId}...`);
    const captureRes = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ppToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!captureRes.ok) {
      const errText = await captureRes.text();
      console.error(`[capture-paypal] Capture failed: ${errText}`);

      // Handle "already captured" 422 error
      if (captureRes.status === 422) {
        console.log("[capture-paypal] Order already captured (422), verifying...");
        // Re-fetch order to get capture details
        const recheck = await fetch(`${base}/v2/checkout/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${ppToken}` },
        });
        if (recheck.ok) {
          const recheckData = await recheck.json();
          if (recheckData.status === "COMPLETED") {
            const cId = recheckData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
            await supabase.from("paypal_transactions")
              .update({
                status: "completed",
                paypal_capture_id: cId ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("paypal_order_id", orderId);
            return json({ status: "COMPLETED", captureId: cId, alreadyCaptured: true });
          }
        }
      }

      // Mark as failed
      await supabase.from("paypal_transactions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("paypal_order_id", orderId);

      throw new Error(`PayPal capture failed: ${errText}`);
    }

    const capture = await captureRes.json();
    const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const payer = capture.payer;
    const finalStatus = capture.status === "COMPLETED" ? "completed" : "failed";

    console.log(`[capture-paypal] Capture result: ${capture.status}, captureId: ${captureId}`);

    // Update transaction
    await supabase
      .from("paypal_transactions")
      .update({
        status: finalStatus,
        paypal_capture_id: captureId ?? null,
        paypal_payer_id: payer?.payer_id ?? null,
        payer_email: payer?.email_address ?? null,
        payer_name: payer?.name
          ? `${payer.name.given_name ?? ""} ${payer.name.surname ?? ""}`.trim()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("paypal_order_id", orderId);

    // Log in billing_history (with idempotency check)
    if (capture.status === "COMPLETED" && captureId) {
      const pu = capture.purchase_units?.[0];
      const amt = Number(pu?.payments?.captures?.[0]?.amount?.value ?? 0);

      const { data: txn } = await supabase
        .from("paypal_transactions")
        .select("payment_type, plan_key")
        .eq("paypal_order_id", orderId)
        .maybeSingle();

      // Check billing_history doesn't already have this
      const { data: existingBill } = await supabase
        .from("billing_history")
        .select("id")
        .eq("stripe_invoice_id", `paypal_${captureId}`)
        .maybeSingle();

      if (!existingBill) {
        await supabase.from("billing_history").insert({
          user_id: user.id,
          amount: amt,
          currency: pu?.payments?.captures?.[0]?.amount?.currency_code ?? "USD",
          status: "paid",
          description: txn?.payment_type === "donation"
            ? "PayPal Donation"
            : `PayPal Payment${txn?.plan_key ? ` - ${txn.plan_key}` : ""}`,
          plan_name: txn?.plan_key ?? null,
          stripe_invoice_id: `paypal_${captureId}`,
        });
      }

      console.log(`[capture-paypal] Billing record created for ${captureId}`);
    }

    return json({
      status: capture.status,
      captureId,
      payerEmail: payer?.email_address,
    });
  } catch (error) {
    console.error("[capture-paypal] Error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
