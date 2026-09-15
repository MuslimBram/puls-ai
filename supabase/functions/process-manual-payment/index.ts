import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

/**
 * process-manual-payment
 *
 * FAZA 0 / D14 — manual & bank payment lifecycle.
 *
 * ── Why this file changed ────────────────────────────────────────────────────
 * Deployed v42 called `.catch()` on three Postgrest builder chains. In
 * @supabase/supabase-js@2.57.2 `PostgrestBuilder` is a thenable that implements
 * `then` ONLY — it has no `.catch` and no `.finally`. Calling `.catch()` on a
 * query therefore throws `TypeError: ... .catch is not a function`
 * SYNCHRONOUSLY, before the await suspends and before any HTTP request is sent.
 * The no-op handler is never installed, so a "fire-and-forget" side write became
 * a hard abort of the whole handler.
 *
 * In the admin_verify approve branch the throw sat between the subscription
 * upsert and everything else, which left this state behind on every approval:
 *
 *     subscriptions    -> payment_status='paid'   WRITTEN
 *     billing_history  -> (nothing)               NEVER SENT
 *     manual_payments  -> still 'submitted'       NEVER UPDATED
 *     notification     -> (nothing)               NEVER SENT
 *     admin response   -> HTTP 500
 *
 * Because manual_payments never left 'submitted', the `status !== "submitted"`
 * guard still passed on retry, so every retry re-upserted the subscription and
 * threw again — a permanent 500 loop against a customer who was already active
 * with no financial record anywhere.
 *
 * ── Invariants this file now holds ───────────────────────────────────────────
 *  1. NO ENTITLEMENT WITHOUT A FINANCIAL RECORD.
 *     billing_history is written FIRST. If it fails, nothing else is written
 *     and no subscription is activated. The previous order guaranteed the
 *     opposite failure mode.
 *  2. COMPLETION IS LAST AND IS THE IDEMPOTENCY MARKER.
 *     manual_payments -> 'paid' is the final durable write. A retry after a
 *     partial failure re-runs from the start and converges; a retry after
 *     success is refused by the status guard.
 *  3. EVERY POSTGREST CALL IS AWAITED AND ITS `error` IS CHECKED EXPLICITLY.
 *     No `.catch()` anywhere in this file. Best-effort writes are marked
 *     best-effort and logged; they never abort a completed money movement.
 *  4. BILLING RECORDS ARE DEDUPLICATED BY reference_id, so a retry cannot
 *     produce two invoices for one payment.
 *
 * ── Deliberately NOT changed (out of scope for FAZA 0) ───────────────────────
 *  - `durationMonths * 30 * 86400 * 1000` (30-day months) is preserved verbatim.
 *    Changing it would change entitlement duration, which this authorisation
 *    explicitly excludes.
 *  - No pricing, entitlement, limit or payment-method activation is touched.
 *  - PREVIEW_FX_TO_EUR remains preview-only and is never used for settlement.
 */

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

// PREVIEW-ONLY FX rates — never used for settlement or invoicing.
// Settlement always uses explicit price from pricing_settings or charged_amount as-is.
const PREVIEW_FX_TO_EUR: Record<string, number> = { EUR: 1.0, USD: 1.08, ALL: 103.5 };

/** Estimate EUR base amount for informational display only. Never for billing. */
function estimateEURPreview(
  amount: number,
  currency: string,
): { base_amount: number; fx_rate: number | null; is_estimate: boolean } {
  const c = currency.toUpperCase();
  if (c === "EUR") return { base_amount: amount, fx_rate: null, is_estimate: false };
  const rate = PREVIEW_FX_TO_EUR[c];
  if (!rate) return { base_amount: amount, fx_rate: null, is_estimate: true }; // unknown currency
  return { base_amount: Math.round((amount / rate) * 100) / 100, fx_rate: rate, is_estimate: true };
}

function recommendMethod(currency: string, country?: string): string[] {
  const c = currency.toUpperCase();
  if (c === "ALL" || country === "AL") return ["bank_transfer_ALL", "payoneer_EUR", "paypal"];
  if (c === "EUR") return ["bank_transfer_EUR", "payoneer_EUR", "paypal"];
  if (c === "USD") return ["bank_transfer_USD", "payoneer_USD", "paypal"];
  return ["paypal", "payoneer_EUR", "bank_transfer_EUR"];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

    const { data: { user }, error: ue } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (ue || !user) return json(req, { error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "GET" ? "get_options" : "create");

    // ─────────────────────────────────────────────────────────── get_options ──
    if (action === "get_options") {
      const currency = url.searchParams.get("currency") || "EUR";
      const country = url.searchParams.get("country") || undefined;

      const { data: configs, error: cfgError } = await sb
        .from("payment_method_config")
        .select(
          "method_type,display_name,instructions,currency,country_target,sort_order,receiving_currency,conversion_warning",
        )
        .eq("is_enabled", true)
        .order("sort_order");
      if (cfgError) throw new Error(`payment_method_config read failed: ${cfgError.message}`);

      // Filter: return methods matching currency OR payoneer (multi-currency provider)
      const filtered = (configs || []).filter(
        (m: any) => m.currency === currency || m.method_type?.startsWith("payoneer"),
      );
      const recommended = recommendMethod(currency, country);

      return json(req, {
        available: filtered,
        all_enabled: configs || [],
        recommended_order: recommended,
        supported_currencies: ["EUR", "USD", "ALL"],
        base_currency: "EUR",
        fx_preview_only: true,
        fx_rates_informational: PREVIEW_FX_TO_EUR,
      });
    }

    // ──────────────────────────────────────────────────────────────── create ──
    if (action === "create") {
      const body = await req.json();
      const {
        plan_key,
        package_type = "monthly",
        payment_method,
        charged_currency,
        charged_amount,
        workspace_id,
        customer_note,
      } = body;

      if (!plan_key || !payment_method || !charged_currency || !charged_amount) {
        return json(
          req,
          { error: "plan_key, payment_method, charged_currency, charged_amount required" },
          400,
        );
      }

      const { data: cfg, error: cfgError } = await sb
        .from("payment_method_config")
        .select("method_type,display_name,instructions,currency,receiving_currency,conversion_warning")
        .eq("method_type", payment_method)
        .eq("is_enabled", true)
        .maybeSingle();
      if (cfgError) throw new Error(`payment_method_config read failed: ${cfgError.message}`);
      if (!cfg) {
        return json(req, { error: `Payment method '${payment_method}' not configured or disabled` }, 400);
      }

      // SETTLEMENT: use charged_amount as-is. Base amount is preview-only estimate.
      const preview = estimateEURPreview(Number(charged_amount), charged_currency);

      const { data: mp, error: mpe } = await sb
        .from("manual_payments")
        .insert({
          user_id: user.id,
          workspace_id: workspace_id || null,
          plan_key,
          package_type,
          payment_method,
          charged_currency: charged_currency.toUpperCase(),
          charged_amount: Number(charged_amount),
          base_currency: "EUR",
          base_amount: preview.base_amount, // informational estimate only
          fx_rate_used: preview.is_estimate ? preview.fx_rate : null,
          status: "pending_payment",
          customer_note: customer_note || null,
        })
        .select("id,reference_id,status,charged_currency,charged_amount,base_amount")
        .single();
      if (mpe || !mp) throw new Error(mpe?.message || "Failed to create payment record");

      return json(req, {
        success: true,
        payment_id: mp.id,
        reference_id: mp.reference_id,
        status: "pending_payment",
        instructions: cfg.instructions,
        payment_method: cfg.display_name,
        receiving_currency: (cfg as any).receiving_currency || null,
        conversion_warning: (cfg as any).conversion_warning || false,
        charged: { amount: mp.charged_amount, currency: mp.charged_currency },
        base_estimate: {
          amount: mp.base_amount,
          currency: "EUR",
          is_estimate: preview.is_estimate,
          note: "EUR equivalent is informational only. Pulse AI does not apply FX rates to settlements.",
        },
        next_step: "submit_confirmation",
        message: `Include reference ${mp.reference_id} in your transfer description.`,
      });
    }

    // ──────────────────────────────────────────────────────────────── submit ──
    if (action === "submit") {
      const { payment_id } = await req.json();
      if (!payment_id) return json(req, { error: "payment_id required" }, 400);

      const { data: mp, error: mpReadError } = await sb
        .from("manual_payments")
        .select("id,user_id,status,reference_id")
        .eq("id", payment_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (mpReadError) throw new Error(`manual_payments read failed: ${mpReadError.message}`);
      if (!mp) return json(req, { error: "Payment not found" }, 404);
      if (mp.status !== "pending_payment") {
        return json(req, { error: `Cannot submit from status: ${mp.status}` }, 400);
      }

      const { error: submitError } = await sb
        .from("manual_payments")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", payment_id);
      if (submitError) throw new Error(`manual_payments submit failed: ${submitError.message}`);

      return json(req, {
        success: true,
        reference_id: mp.reference_id,
        status: "submitted",
        message: "Submitted for verification. Subscription activates within 1 business day.",
      });
    }

    // ────────────────────────────────────────────────────────── admin_verify ──
    if (action === "admin_verify") {
      const { payment_id, approve, rejection_reason, admin_note } = await req.json();

      const { data: role, error: roleError } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();
      if (roleError) throw new Error(`role lookup failed: ${roleError.message}`);
      if (!role) return json(req, { error: "Admin access required" }, 403);

      const { data: mp, error: mpReadError } = await sb
        .from("manual_payments")
        .select("*")
        .eq("id", payment_id)
        .maybeSingle();
      if (mpReadError) throw new Error(`manual_payments read failed: ${mpReadError.message}`);
      if (!mp) return json(req, { error: "Payment not found" }, 404);

      // Idempotency guard. Because completion is the LAST durable write, a
      // request that already completed is refused here rather than replayed.
      if (mp.status !== "submitted") {
        return json(req, { error: "Payment not in submitted status" }, 400);
      }

      // ── Rejection ──────────────────────────────────────────────────────────
      if (!approve) {
        const { error: rejectError } = await sb
          .from("manual_payments")
          .update({
            status: "rejected",
            rejection_reason: rejection_reason || "Payment not verified",
            admin_note: admin_note || null,
            verified_by: user.id,
            verified_at: new Date().toISOString(),
          })
          .eq("id", payment_id);
        if (rejectError) throw new Error(`manual_payments reject failed: ${rejectError.message}`);

        // Best-effort: a failed notification must not undo a recorded rejection.
        const { error: notifyError } = await sb.from("business_notifications").insert({
          user_id: mp.user_id,
          title: "Payment Not Verified",
          message: `Your payment ${mp.reference_id} could not be verified. Reason: ${rejection_reason || "Not specified"}. Please contact support.`,
          notification_type: "warning",
          category: "billing",
        });
        if (notifyError) {
          console.error("[manual-payment] rejection notification failed", notifyError.message);
        }

        return json(req, {
          success: true,
          status: "rejected",
          notification_sent: !notifyError,
        });
      }

      // ── Approval ───────────────────────────────────────────────────────────
      const now = new Date().toISOString();
      const durationMonths =
        mp.package_type === "yearly" ? 12 : mp.package_type === "6-month" ? 6 : mp.package_type === "3-month" ? 3 : 1;
      // Preserved verbatim from v42: 30-day months. Changing this changes
      // entitlement duration and is out of scope for this authorisation.
      const periodEnd = new Date(Date.now() + durationMonths * 30 * 86400 * 1000).toISOString();

      // STEP 1 — financial record FIRST. No entitlement without it.
      // Deduplicated by reference_id so a retry cannot create a second invoice.
      const { data: existingBilling, error: billingLookupError } = await sb
        .from("billing_history")
        .select("id")
        .eq("reference_id", mp.reference_id)
        .maybeSingle();
      if (billingLookupError) {
        throw new Error(`billing_history lookup failed: ${billingLookupError.message}`);
      }

      let billingId: string | null = existingBilling?.id ?? null;
      if (!billingId) {
        const { data: bh, error: billingError } = await sb
          .from("billing_history")
          .insert({
            user_id: mp.user_id,
            amount: mp.charged_amount,
            currency: mp.charged_currency,
            charged_currency: mp.charged_currency,
            charged_amount: mp.charged_amount,
            base_currency: "EUR",
            base_amount: mp.base_amount,
            fx_rate_used: mp.fx_rate_used,
            payment_method: mp.payment_method,
            reference_id: mp.reference_id,
            status: "completed",
            plan_name: mp.plan_key,
            description: `${mp.plan_key} plan (${mp.package_type}) — verified manual payment`,
          })
          .select("id")
          .single();
        // Hard failure: abort BEFORE any entitlement is granted. Nothing has
        // been written yet, so the admin may safely retry.
        if (billingError || !bh) {
          throw new Error(`billing_history insert failed: ${billingError?.message ?? "no row returned"}`);
        }
        billingId = bh.id;
      }

      // STEP 2 — entitlement, now that the money is on record.
      const { error: subscriptionError } = await sb.from("subscriptions").upsert(
        {
          user_id: mp.user_id,
          plan: mp.plan_key,
          subscription_status: "active",
          payment_status: "paid",
          payment_method: mp.payment_method,
          payment_currency: mp.charged_currency,
          package_type: mp.package_type,
          package_duration_months: durationMonths,
          billing_cycle_start: now,
          package_start_at: now,
          package_end_at: periodEnd,
          updated_at: now,
        },
        { onConflict: "user_id" },
      );
      if (subscriptionError) {
        throw new Error(`subscriptions upsert failed: ${subscriptionError.message}`);
      }

      // STEP 3 — completion marker LAST. This is what makes the operation
      // idempotent: until it lands, a retry re-converges; once it lands, the
      // status guard above refuses a replay.
      const { error: completionError } = await sb
        .from("manual_payments")
        .update({
          status: "paid",
          verified_by: user.id,
          verified_at: now,
          admin_note: admin_note || null,
          billing_history_id: billingId,
          subscription_activated_at: now,
        })
        .eq("id", payment_id);
      if (completionError) {
        throw new Error(`manual_payments completion failed: ${completionError.message}`);
      }

      // STEP 4 — best-effort notification. Never aborts a completed payment.
      const { error: notifyError } = await sb.from("business_notifications").insert({
        user_id: mp.user_id,
        title: "Subscription Activated!",
        message: `Your ${mp.plan_key} plan is now active. Ref: ${mp.reference_id}. Valid until ${periodEnd.split("T")[0]}.`,
        notification_type: "success",
        category: "billing",
        action_url: "/subscription",
      });
      if (notifyError) {
        console.error("[manual-payment] activation notification failed", notifyError.message);
      }

      return json(req, {
        success: true,
        status: "paid",
        subscription_activated: true,
        period_end: periodEnd,
        billing_history_id: billingId,
        notification_sent: !notifyError,
      });
    }

    // ──────────────────────────────────────────────────────────────── status ──
    if (action === "status") {
      const payment_id = url.searchParams.get("payment_id");
      if (!payment_id) return json(req, { error: "payment_id required" }, 400);

      const { data: mp, error: statusError } = await sb
        .from("manual_payments")
        .select(
          "id,reference_id,status,plan_key,charged_currency,charged_amount,created_at,submitted_at,verified_at",
        )
        .eq("id", payment_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (statusError) throw new Error(`manual_payments read failed: ${statusError.message}`);
      if (!mp) return json(req, { error: "Not found" }, 404);

      return json(req, mp);
    }

    return json(req, { error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    console.error("[manual-payment] handler error", e?.message ?? e);
    return json(req, { error: e.message }, 500);
  }
});
