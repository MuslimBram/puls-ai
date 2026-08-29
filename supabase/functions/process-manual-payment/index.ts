import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

const PACKAGE_VARIANTS = {
  monthly: { months: 1, discount: 0 },
  "3-month": { months: 3, discount: 5 },
  "6-month": { months: 6, discount: 10 },
  yearly: { months: 12, discount: 15 },
} as const;

type PackageType = keyof typeof PACKAGE_VARIANTS;
type SupportedCurrency = "ALL" | "EUR" | "USD";

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const sameMoney = (a: number, b: number) => Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;

function normalizeCurrency(value: unknown): SupportedCurrency {
  const currency = String(value ?? "").toUpperCase();
  if (currency === "ALL" || currency === "EUR" || currency === "USD") return currency;
  throw new Error("Unsupported manual-payment currency");
}

function normalizePackage(value: unknown): PackageType {
  const packageType = String(value ?? "monthly") as PackageType;
  if (!(packageType in PACKAGE_VARIANTS)) throw new Error("Unsupported package type");
  return packageType;
}

function packageTotal(monthly: number, packageType: PackageType) {
  const cfg = PACKAGE_VARIANTS[packageType];
  return roundMoney(monthly * cfg.months * (1 - cfg.discount / 100));
}

function addMonths(anchor: string, months: number) {
  const start = new Date(anchor);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid payment activation anchor");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function resolveCanonicalPrice(
  sb: ReturnType<typeof createClient>,
  planKey: string,
  packageType: PackageType,
  currency: SupportedCurrency,
) {
  const { data: plan, error } = await sb
    .from("pricing_settings")
    .select("plan_key, plan_label, monthly_price_all, monthly_price_eur, monthly_price_usd, is_public, is_donation")
    .eq("plan_key", planKey)
    .eq("is_public", true)
    .eq("is_donation", false)
    .maybeSingle();
  if (error) throw error;
  if (!plan) throw new Error("Plan is not available for manual payment");

  const monthlyByCurrency: Record<SupportedCurrency, number> = {
    ALL: Number(plan.monthly_price_all),
    EUR: Number(plan.monthly_price_eur),
    USD: Number(plan.monthly_price_usd),
  };
  const monthly = monthlyByCurrency[currency];
  const monthlyEur = Number(plan.monthly_price_eur);
  if (!Number.isFinite(monthly) || monthly <= 0 || !Number.isFinite(monthlyEur) || monthlyEur <= 0) {
    throw new Error(`Canonical price is not configured for ${currency}`);
  }

  return {
    planKey: String(plan.plan_key),
    planLabel: String(plan.plan_label ?? plan.plan_key),
    chargedAmount: packageTotal(monthly, packageType),
    baseAmountEur: packageTotal(monthlyEur, packageType),
    packageMonths: PACKAGE_VARIANTS[packageType].months,
    discountPercent: PACKAGE_VARIANTS[packageType].discount,
  };
}

async function requireWorkspaceAccess(
  sb: ReturnType<typeof createClient>,
  userId: string,
  workspaceId: string,
) {
  const [{ data: owned }, { data: member }] = await Promise.all([
    sb.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", userId).maybeSingle(),
    sb.from("workspace_members").select("workspace_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
  ]);
  if (!owned && !member) throw new Error("Forbidden: workspace access required");

  const { data: sub, error: subError } = await sb
    .from("subscriptions")
    .select("workspace_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (subError) throw subError;
  if (!sub?.workspace_id || sub.workspace_id !== workspaceId) {
    throw new Error("Workspace does not match the user's subscription tenant");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    getServiceKey() ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const { data: { user }, error: userError } = await sb.auth.getUser(auth.slice(7));
    if (userError || !user) return json(req, { error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "GET" ? "get_options" : "create");

    if (action === "get_options") {
      const currency = normalizeCurrency(url.searchParams.get("currency") || "EUR");
      const { data: configs, error } = await sb
        .from("payment_method_config")
        .select("method_type,display_name,instructions,currency,country_target,sort_order,receiving_currency,conversion_warning")
        .eq("is_enabled", true)
        .eq("currency", currency)
        .order("sort_order");
      if (error) throw error;
      return json(req, {
        available: configs ?? [],
        supported_currencies: ["EUR", "USD", "ALL"],
        base_currency: "EUR",
      });
    }

    if (action === "create") {
      const body = await req.json();
      const planKey = String(body?.plan_key ?? "");
      const packageType = normalizePackage(body?.package_type);
      const paymentMethod = String(body?.payment_method ?? "");
      const currency = normalizeCurrency(body?.charged_currency);
      const requestedAmount = Number(body?.charged_amount);
      const workspaceId = String(body?.workspace_id ?? "");
      if (!planKey || !paymentMethod || !workspaceId || !Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        return json(req, { error: "plan_key, package_type, payment_method, charged_currency, charged_amount and workspace_id are required" }, 400);
      }

      await requireWorkspaceAccess(sb, user.id, workspaceId);

      const { data: method, error: methodError } = await sb
        .from("payment_method_config")
        .select("method_type,display_name,instructions,currency,receiving_currency,conversion_warning")
        .eq("method_type", paymentMethod)
        .eq("is_enabled", true)
        .eq("currency", currency)
        .maybeSingle();
      if (methodError) throw methodError;
      if (!method) return json(req, { error: "Payment method is disabled or does not support the selected currency" }, 400);

      const price = await resolveCanonicalPrice(sb, planKey, packageType, currency);
      if (!sameMoney(requestedAmount, price.chargedAmount)) {
        return json(req, {
          error: "Submitted amount does not match the canonical pricing catalog",
          expected_amount: price.chargedAmount,
          currency,
        }, 409);
      }

      const { data: payment, error: paymentError } = await sb
        .from("manual_payments")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          plan_key: price.planKey,
          package_type: packageType,
          payment_method: paymentMethod,
          charged_currency: currency,
          charged_amount: price.chargedAmount,
          base_currency: "EUR",
          base_amount: price.baseAmountEur,
          fx_rate_used: null,
          status: "pending_payment",
          customer_note: typeof body?.customer_note === "string" ? body.customer_note.slice(0, 1000) : null,
          metadata: {
            pricing_source: "pricing_settings",
            canonical_charged_amount: price.chargedAmount,
            canonical_base_amount_eur: price.baseAmountEur,
            package_months: price.packageMonths,
            package_discount_percent: price.discountPercent,
          },
        })
        .select("id,reference_id,status,charged_currency,charged_amount,base_amount")
        .single();
      if (paymentError || !payment) throw paymentError ?? new Error("Failed to create payment record");

      return json(req, {
        success: true,
        payment_id: payment.id,
        reference_id: payment.reference_id,
        status: payment.status,
        instructions: method.instructions,
        payment_method: method.display_name,
        receiving_currency: method.receiving_currency,
        conversion_warning: method.conversion_warning,
        charged: { amount: payment.charged_amount, currency: payment.charged_currency },
        base: { amount: payment.base_amount, currency: "EUR" },
        next_step: "submit_confirmation",
      });
    }

    if (action === "submit") {
      const { payment_id } = await req.json();
      if (!payment_id) return json(req, { error: "payment_id required" }, 400);
      const { data: payment, error } = await sb
        .from("manual_payments")
        .select("id,user_id,status,reference_id")
        .eq("id", payment_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!payment) return json(req, { error: "Payment not found" }, 404);
      if (payment.status !== "pending_payment") return json(req, { error: `Cannot submit from status: ${payment.status}` }, 400);
      const { error: updateError } = await sb.from("manual_payments")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", payment_id)
        .eq("user_id", user.id);
      if (updateError) throw updateError;
      return json(req, { success: true, reference_id: payment.reference_id, status: "submitted" });
    }

    if (action === "admin_verify") {
      const body = await req.json();
      const paymentId = body?.payment_id;
      if (!paymentId) return json(req, { error: "payment_id required" }, 400);

      const { data: role, error: roleError } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();
      if (roleError) throw roleError;
      if (!role) return json(req, { error: "Platform admin access required" }, 403);

      const { data: payment, error: paymentError } = await sb
        .from("manual_payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();
      if (paymentError) throw paymentError;
      if (!payment) return json(req, { error: "Payment not found" }, 404);
      if (payment.status !== "submitted") return json(req, { error: "Payment not in submitted status" }, 409);

      if (!body?.approve) {
        const { error: rejectError } = await sb.from("manual_payments").update({
          status: "rejected",
          rejection_reason: String(body?.rejection_reason ?? "Payment not verified").slice(0, 1000),
          admin_note: typeof body?.admin_note === "string" ? body.admin_note.slice(0, 1000) : null,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        }).eq("id", paymentId).eq("status", "submitted");
        if (rejectError) throw rejectError;
        return json(req, { success: true, status: "rejected" });
      }

      if (!payment.workspace_id) throw new Error("Submitted payment has no workspace identity");
      if (payment.metadata?.pricing_source !== "pricing_settings" ||
          !sameMoney(Number(payment.charged_amount), Number(payment.metadata?.canonical_charged_amount)) ||
          !sameMoney(Number(payment.base_amount), Number(payment.metadata?.canonical_base_amount_eur))) {
        throw new Error("Submitted payment does not carry a trusted canonical pricing snapshot");
      }

      const packageType = normalizePackage(payment.package_type);
      const cfg = PACKAGE_VARIANTS[packageType];

      let { data: bill, error: billLookupError } = await sb
        .from("billing_history")
        .select("id,created_at")
        .eq("reference_id", payment.reference_id)
        .maybeSingle();
      if (billLookupError) throw billLookupError;

      if (!bill) {
        const { data: createdBill, error: billError } = await sb.from("billing_history").insert({
          user_id: payment.user_id,
          workspace_id: payment.workspace_id,
          amount: payment.charged_amount,
          currency: payment.charged_currency,
          charged_currency: payment.charged_currency,
          charged_amount: payment.charged_amount,
          base_currency: "EUR",
          base_amount: payment.base_amount,
          fx_rate_used: null,
          payment_method: payment.payment_method,
          reference_id: payment.reference_id,
          status: "completed",
          plan_name: payment.plan_key,
          description: `${payment.plan_key} plan (${packageType}) — verified manual payment`,
        }).select("id,created_at").single();
        if (billError || !createdBill) throw billError ?? new Error("Failed to create billing history");
        bill = createdBill;
      }

      const window = addMonths(bill.created_at, cfg.months);
      const { data: subscription, error: subscriptionError } = await sb
        .from("subscriptions")
        .update({
          plan: payment.plan_key,
          subscription_status: "active",
          payment_status: "paid",
          payment_method: payment.payment_method,
          payment_currency: payment.charged_currency,
          package_type: packageType,
          package_duration_months: cfg.months,
          package_discount_percent: cfg.discount,
          qualifying_package_type: ["3-month", "6-month"].includes(packageType) ? packageType : null,
          billing_cycle_start: window.start,
          package_start_at: window.start,
          package_end_at: window.end,
          grace_period_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", payment.user_id)
        .eq("workspace_id", payment.workspace_id)
        .select("id")
        .maybeSingle();
      if (subscriptionError) throw subscriptionError;
      if (!subscription) throw new Error("No canonical subscription row exists for this payment tenant");

      const verifiedAt = new Date().toISOString();
      const { error: paidError } = await sb.from("manual_payments").update({
        status: "paid",
        verified_by: user.id,
        verified_at: verifiedAt,
        admin_note: typeof body?.admin_note === "string" ? body.admin_note.slice(0, 1000) : null,
        billing_history_id: bill.id,
        subscription_activated_at: window.start,
      }).eq("id", paymentId).eq("status", "submitted");
      if (paidError) throw paidError;

      return json(req, {
        success: true,
        status: "paid",
        subscription_activated: true,
        period_end: window.end,
      });
    }

    if (action === "status") {
      const paymentId = url.searchParams.get("payment_id");
      if (!paymentId) return json(req, { error: "payment_id required" }, 400);
      const { data: payment, error } = await sb
        .from("manual_payments")
        .select("id,reference_id,status,plan_key,package_type,charged_currency,charged_amount,created_at,submitted_at,verified_at")
        .eq("id", paymentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!payment) return json(req, { error: "Not found" }, 404);
      return json(req, payment);
    }

    return json(req, { error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("process-manual-payment error:", message);
    const status = message.startsWith("Forbidden") ? 403 : 400;
    return json(req, { error: message }, status);
  }
});
