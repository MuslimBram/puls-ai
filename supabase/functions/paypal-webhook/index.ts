/**
 * paypal-webhook — Fail-closed PayPal event verification
 *
 * SECURITY CONTRACT:
 *   1. Missing config (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID) → 503
 *   2. Missing required PayPal headers → 400
 *   3. OAuth token acquisition failure → 503 (retry later, no side effects)
 *   4. Verification API non-2xx → 503 (retry later, no side effects)
 *   5. verification_status != "SUCCESS" → 403
 *   6. Any exception during verification → reject (never continue)
 *   7. ONLY after verified: atomic idempotency claim via UNIQUE(provider,event_id)
 *   8. Duplicate → 200 already_processed (zero repeated side effects)
 *   9. Trusted purchase events only → customer-brain financial feedback
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Fail-closed PayPal signature verification via Verify-Webhook-Signature API */
async function verifyPayPalWebhookStrict(
  req: Request,
  rawBody: string,
): Promise<{ ok: boolean; reason: string }> {
  const clientId     = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const webhookId    = Deno.env.get("PAYPAL_WEBHOOK_ID");
  const sandbox      = Deno.env.get("PAYPAL_SANDBOX") === "true";

  // 1. Fail-closed: missing configuration
  if (!clientId || !clientSecret || !webhookId) {
    return { ok: false, reason: "paypal_credentials_not_configured" };
  }

  // 2. Required PayPal headers
  const authAlgo     = req.headers.get("paypal-auth-algo");
  const certUrl      = req.headers.get("paypal-cert-url");
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const transmissionSig  = req.headers.get("paypal-transmission-sig");

  if (!authAlgo || !certUrl || !transmissionId || !transmissionTime || !transmissionSig) {
    return { ok: false, reason: "missing_paypal_headers" };
  }

  const base = sandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  // 3. OAuth token — failure = reject immediately (no fallthrough)
  let access_token: string;
  try {
    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenRes.ok) {
      console.error("[PayPal] OAuth failed:", tokenRes.status);
      return { ok: false, reason: "oauth_token_failed" };
    }
    const tokenData = await tokenRes.json();
    access_token = tokenData.access_token;
    if (!access_token) return { ok: false, reason: "oauth_token_missing" };
  } catch (e: any) {
    console.error("[PayPal] OAuth exception:", e.message);
    return { ok: false, reason: "oauth_exception" };
  }

  // 4. Verify-Webhook-Signature API — non-2xx = reject (no side effects)
  try {
    const verifyRes = await fetch(
      `${base}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo:         authAlgo,
          cert_url:          certUrl,
          transmission_id:   transmissionId,
          transmission_time: transmissionTime,
          transmission_sig:  transmissionSig,
          webhook_id:        webhookId,
          webhook_event:     JSON.parse(rawBody),
        }),
      },
    );

    if (!verifyRes.ok) {
      console.error("[PayPal] Verify API non-2xx:", verifyRes.status);
      return { ok: false, reason: "verify_api_failed" };
    }

    const verifyData = await verifyRes.json();

    // 5. verification_status must be SUCCESS — anything else = reject
    if (verifyData.verification_status !== "SUCCESS") {
      console.warn("[PayPal] Verification status:", verifyData.verification_status);
      return { ok: false, reason: `verification_status_${verifyData.verification_status}` };
    }

    return { ok: true, reason: "verified" };
  } catch (e: any) {
    // 6. Exception during verification = reject, never continue
    console.error("[PayPal] Verify exception:", e.message);
    return { ok: false, reason: "verify_exception" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let rawBody: string;
  try {
    rawBody = await req.text();
    if (!rawBody) return json({ error: "empty_body" }, 400);
  } catch {
    return json({ error: "body_read_error" }, 400);
  }

  // ── VERIFY AUTHENTICITY — FAIL CLOSED ────────────────────────────────────
  const verifyResult = await verifyPayPalWebhookStrict(req, rawBody);
  if (!verifyResult.ok) {
    const statusCode = verifyResult.reason.includes("not_configured") ||
                       verifyResult.reason.includes("failed") ||
                       verifyResult.reason.includes("exception") ? 503 : 403;
    console.warn("[PayPal] Rejected:", verifyResult.reason);
    return json({ error: verifyResult.reason }, statusCode);
  }

  // ── PARSE EVENT (only after verification) ────────────────────────────────
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventId   = event?.id;
  const eventType = event?.event_type;

  if (!eventId) return json({ error: "missing_event_id" }, 400);

  // ── ATOMIC IDEMPOTENCY CLAIM — BEFORE side effects ───────────────────────
  // Uses UNIQUE(provider, event_id) — INSERT returns null if already claimed
  const { data: claimed, error: claimError } = await sb
    .from("processed_webhook_events")
    .insert({ provider: "paypal", event_id: `paypal:${eventId}` })
    .select("id")
    .single();

  if (claimError) {
    // Unique constraint violation = already processed — safe 200
    if (claimError.code === "23505") {
      return json({ status: "already_processed", event_id: eventId }, 200);
    }
    console.error("[PayPal] Claim error:", claimError.message);
    return json({ error: "claim_failed" }, 500);
  }

  // ── PROCESS EVENT ─────────────────────────────────────────────────────────
  try {
    const eventData = event?.resource ?? {};

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      // Resolve workspace from payment metadata
      const orderId  = eventData?.supplementary_data?.related_ids?.order_id
                    ?? eventData?.purchase_units?.[0]?.reference_id
                    ?? null;
      const payerId  = event?.resource?.payer?.payer_id ?? null;
      const amount   = eventData?.amount?.value;
      const currency = eventData?.amount?.currency_code ?? "ALL";

      // Update any tracked order/payment
      if (orderId) {
        await sb.from("orders").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_provider: "paypal",
          payment_id: eventId,
        }).eq("provider_order_id", orderId).catch(() => {});
      }

      // Customer attribution and trusted brain feedback
      // Resolve lead by payer_id (external PayPal ID — match stored identifier)
      if (payerId) {
        const { data: lead } = await sb.from("leads")
          .select("id,workspace_id")
          .eq("contact_identifier", payerId)
          .maybeSingle();

        if (lead?.id && lead?.workspace_id) {
          // Update idempotency record with workspace context
          await sb.from("processed_webhook_events")
            .update({ workspace_id: lead.workspace_id })
            .eq("id", claimed!.id).catch(() => {});

          // TRUSTED financial feedback — internal path only
          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
              },
              body: JSON.stringify({
                action: "feedback",
                workspace_id: lead.workspace_id,
                lead_id:      lead.id,
                event_type:   "purchased",     // trusted financial event
                channel:      "paypal",
                event_data: {
                  paypal_event_id: eventId,
                  order_id:        orderId,
                  amount,
                  currency,
                },
              }),
            },
          ).catch(() => {}); // non-critical — must not affect webhook response
        }
      }
    }

    // Log raw event for audit
    await sb.from("webhook_audit_log").insert({
      provider:   "paypal",
      event_type: eventType,
      event_id:   eventId,
      payload:    event,
      processed_at: new Date().toISOString(),
    }).catch(() => {}); // table may not exist yet — non-critical

    return json({ ok: true, event_id: eventId, event_type: eventType });

  } catch (e: any) {
    console.error("[PayPal] Processing error:", e.message);
    return json({ error: "processing_error" }, 500);
  }
});
