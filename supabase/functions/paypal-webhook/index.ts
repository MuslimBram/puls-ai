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

async function verifyPayPalWebhook(
  req: Request,
  body: string,
  webhookId: string,
  clientId: string,
  clientSecret: string,
  sandbox: boolean,
): Promise<boolean> {
  const base = sandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  // Get access token
  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) return false;
  const { access_token } = await tokenRes.json();

  // Verify webhook signature
  const verifyRes = await fetch(
    `${base}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: req.headers.get("paypal-auth-algo") || "",
        cert_url: req.headers.get("paypal-cert-url") || "",
        transmission_id: req.headers.get("paypal-transmission-id") || "",
        transmission_sig: req.headers.get("paypal-transmission-sig") || "",
        transmission_time: req.headers.get("paypal-transmission-time") || "",
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    },
  );

  if (!verifyRes.ok) {
    console.warn("[paypal-webhook] Signature verification request failed");
    return false;
  }

  const verifyData = await verifyRes.json();
  return verifyData.verification_status === "SUCCESS";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const rawBody = await req.text();
  let event: any;

  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error("[paypal-webhook] Invalid JSON body");
    return json({ error: "Invalid JSON" }, 400);
  }

  const eventType = event.event_type;
  const resourceId = event.resource?.id;

  console.log(`[paypal-webhook] Received event: ${eventType}, resource: ${resourceId}`);

  // Log every webhook event
  await supabase.from("paypal_webhook_events").insert({
    event_id: event.id || null,
    event_type: eventType,
    resource_id: resourceId || null,
    payload: event,
    status: "received",
  });

  // Optionally verify signature if PAYPAL_WEBHOOK_ID is set
  const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const sandbox = Deno.env.get("PAYPAL_SANDBOX") !== "false";

  if (webhookId && clientId && clientSecret) {
    const verified = await verifyPayPalWebhook(
      req, rawBody, webhookId, clientId, clientSecret, sandbox,
    );
    if (!verified) {
      console.warn("[paypal-webhook] Signature verification FAILED");
      await supabase.from("paypal_webhook_events")
        .update({ status: "signature_failed" })
        .eq("event_id", event.id);
      return json({ error: "Signature verification failed" }, 403);
    }
    console.log("[paypal-webhook] Signature verified");
  }

  try {
    switch (eventType) {
      case "CHECKOUT.ORDER.APPROVED": {
        const orderId = event.resource?.id;
        if (!orderId) break;

        console.log(`[paypal-webhook] Order approved: ${orderId}`);

        // Update transaction status
        await supabase.from("paypal_transactions")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("paypal_order_id", orderId)
          .eq("status", "pending");

        // Auto-capture the order server-side
        if (clientId && clientSecret) {
          const base = sandbox
            ? "https://api-m.sandbox.paypal.com"
            : "https://api-m.paypal.com";

          const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });
          const { access_token } = await tokenRes.json();

          const captureRes = await fetch(
            `${base}/v2/checkout/orders/${orderId}/capture`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
              },
            },
          );

          if (captureRes.ok) {
            const capture = await captureRes.json();
            const captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
            const payer = capture.payer;

            await supabase.from("paypal_transactions")
              .update({
                status: capture.status === "COMPLETED" ? "completed" : "failed",
                paypal_capture_id: captureId ?? null,
                paypal_payer_id: payer?.payer_id ?? null,
                payer_email: payer?.email_address ?? null,
                payer_name: payer?.name
                  ? `${payer.name.given_name ?? ""} ${payer.name.surname ?? ""}`.trim()
                  : null,
                updated_at: new Date().toISOString(),
              })
              .eq("paypal_order_id", orderId);

            console.log(`[paypal-webhook] Auto-captured order ${orderId}: ${capture.status}`);
          } else {
            const errText = await captureRes.text();
            console.error(`[paypal-webhook] Auto-capture failed: ${errText}`);

            // If capture fails with UNPROCESSABLE (already captured), that's OK
            if (captureRes.status === 422) {
              console.log("[paypal-webhook] Order already captured, skipping");
            } else {
              await supabase.from("paypal_transactions")
                .update({ status: "capture_failed", updated_at: new Date().toISOString() })
                .eq("paypal_order_id", orderId);
            }
          }
        }
        break;
      }

      case "PAYMENT.CAPTURE.COMPLETED": {
        const captureId = event.resource?.id;
        const orderId = event.resource?.supplementary_data?.related_ids?.order_id;

        console.log(`[paypal-webhook] Capture completed: ${captureId}, order: ${orderId}`);

        if (orderId) {
          // Idempotency: only update if not already completed
          const { data: existing } = await supabase
            .from("paypal_transactions")
            .select("status")
            .eq("paypal_order_id", orderId)
            .maybeSingle();

          if (existing && existing.status !== "completed") {
            const amount = Number(event.resource?.amount?.value ?? 0);
            const currency = event.resource?.amount?.currency_code ?? "USD";

            await supabase.from("paypal_transactions")
              .update({
                status: "completed",
                paypal_capture_id: captureId,
                updated_at: new Date().toISOString(),
              })
              .eq("paypal_order_id", orderId);

            // Also insert billing history if not exists
            const { data: txn } = await supabase
              .from("paypal_transactions")
              .select("user_id, payment_type, plan_key")
              .eq("paypal_order_id", orderId)
              .maybeSingle();

            if (txn) {
              const { data: existingBill } = await supabase
                .from("billing_history")
                .select("id")
                .eq("stripe_invoice_id", `paypal_${captureId}`)
                .maybeSingle();

              if (!existingBill) {
                await supabase.from("billing_history").insert({
                  user_id: txn.user_id,
                  amount,
                  currency,
                  status: "paid",
                  description: txn.payment_type === "donation"
                    ? "PayPal Donation"
                    : `PayPal Payment${txn.plan_key ? ` - ${txn.plan_key}` : ""}`,
                  plan_name: txn.plan_key ?? null,
                  stripe_invoice_id: `paypal_${captureId}`,
                });
              }
            }
          } else {
            console.log("[paypal-webhook] Order already completed, skipping");
          }
        }
        break;
      }

      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.REVERSED": {
        const captureId = event.resource?.id;
        const orderId = event.resource?.supplementary_data?.related_ids?.order_id;

        console.log(`[paypal-webhook] Capture ${eventType}: ${captureId}`);

        if (orderId) {
          await supabase.from("paypal_transactions")
            .update({
              status: eventType === "PAYMENT.CAPTURE.DENIED" ? "denied" : "reversed",
              updated_at: new Date().toISOString(),
            })
            .eq("paypal_order_id", orderId);
        }

        // Also try by capture ID
        if (captureId) {
          await supabase.from("paypal_transactions")
            .update({
              status: eventType === "PAYMENT.CAPTURE.DENIED" ? "denied" : "reversed",
              updated_at: new Date().toISOString(),
            })
            .eq("paypal_capture_id", captureId);
        }
        break;
      }

      default:
        console.log(`[paypal-webhook] Unhandled event type: ${eventType}`);
    }

    // Mark webhook event as processed
    await supabase.from("paypal_webhook_events")
      .update({ status: "processed" })
      .eq("event_id", event.id);

    return json({ received: true });
  } catch (error) {
    console.error("[paypal-webhook] Processing error:", error);

    await supabase.from("paypal_webhook_events")
      .update({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("event_id", event.id);

    return json({ error: "Processing error" }, 500);
  }
});
