import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { ELIGIBLE_PAYMENT_STATUSES, POLICY_EFFECTIVE_FROM } from "../_shared/commission-policy.ts";
import {
  processManagementFee,
  processSubscriptionPayment,
  reverseCommissionsForPayment,
} from "../_shared/commission-engine.ts";
import { createSupabaseCommissionStore } from "../_shared/commission-store-supabase.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });
const PAGE = 500;

/**
 * Commission generator — OFFICIAL PARTNER & REFERRAL POLICY (owner-v1).
 *
 *   Referral Program → 15% of the first successful payment (once)
 *   Freelancer       → 15% of the first successful payment (once)
 *                      + 20% of management fees actually collected
 *   Ambassador       → 15% of every successful payment (lifetime)
 *                      + 15% one-time bonus on the first payment
 *
 * Provider-agnostic: it reads billing_history (Stripe, PayPal, manual
 * payments) and partner_management_fees. Every write is idempotent on the
 * source payment id, so this job can run as often as needed. Payments made
 * before the policy effective date are never recalculated.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  const unauth = requireCronAuth(req);
  if (unauth) return new Response(unauth.body, { status: unauth.status, headers: { ...getCors(req), "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    getServiceKey() ?? "",
    { auth: { persistSession: false } },
  );
  const store = createSupabaseCommissionStore(supabase);
  const summary = { payments: 0, generated: 0, duplicates: 0, skipped: {} as Record<string, number>, managementFees: 0, reversals: 0 };
  const countSkip = (reason: string) => { summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1; };

  try {
    await supabase.rpc("sync_referral_statuses").catch(() => {});

    // 1. Successful subscription payments since the policy took effect.
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await supabase
        .from("billing_history")
        .select("id, user_id, workspace_id, amount, currency, status, created_at, refund_amount")
        .not("workspace_id", "is", null)
        .in("status", [...ELIGIBLE_PAYMENT_STATUSES])
        .gte("created_at", POLICY_EFFECTIVE_FROM)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const row of rows ?? []) {
        summary.payments++;
        const r = await processSubscriptionPayment(store, {
          id: row.id,
          workspaceId: row.workspace_id,
          payerUserId: row.user_id,
          amount: Number(row.amount),
          currency: row.currency,
          status: row.status,
          createdAt: row.created_at,
          refundAmount: Number(row.refund_amount ?? 0),
        });
        if (r.status === "processed") {
          summary.generated += r.inserted.length;
          summary.duplicates += r.duplicates.length;
        } else countSkip(r.reason);
      }
      if (!rows || rows.length < PAGE) break;
    }

    // 2. Management fees actually collected (Freelancer 20%).
    for (let from = 0; ; from += PAGE) {
      const { data: fees, error } = await supabase
        .from("partner_management_fees")
        .select("id, partner_id, workspace_id, amount, currency, status, refund_amount")
        .eq("status", "collected")
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const fee of fees ?? []) {
        const r = await processManagementFee(store, {
          id: fee.id,
          partnerId: fee.partner_id,
          workspaceId: fee.workspace_id,
          amount: Number(fee.amount),
          currency: fee.currency,
          status: fee.status,
          refundAmount: Number(fee.refund_amount ?? 0),
        });
        if (r.status === "processed") summary.managementFees += r.inserted.length;
        else countSkip(`fee_${r.reason}`);
      }
      if (!fees || fees.length < PAGE) break;
    }

    // 3. Refunds recorded by any provider (PayPal, manual) → reverse commissions.
    const { data: refunded, error: refErr } = await supabase
      .from("billing_history")
      .select("id, amount, refund_amount, status")
      .gte("created_at", POLICY_EFFECTIVE_FROM)
      .or("refund_amount.gt.0,status.in.(refunded,partially_refunded,charged_back,disputed)");
    if (refErr) throw refErr;
    for (const row of refunded ?? []) {
      const chargeback = ["charged_back", "disputed"].includes(String(row.status));
      const r = await reverseCommissionsForPayment(store, {
        sourcePaymentKind: "subscription_payment",
        sourcePaymentId: row.id,
        paymentAmount: Number(row.amount),
        refundedAmount: chargeback ? undefined : Number(row.refund_amount ?? row.amount),
        reason: chargeback ? "chargeback" : "refund",
      });
      summary.reversals += r.reversed.length;
    }

    const { data: reversedFees } = await supabase
      .from("partner_management_fees")
      .select("id, amount, refund_amount, status")
      .in("status", ["refunded", "cancelled"]);
    for (const fee of reversedFees ?? []) {
      const r = await reverseCommissionsForPayment(store, {
        sourcePaymentKind: "management_fee",
        sourcePaymentId: fee.id,
        paymentAmount: Number(fee.amount),
        refundedAmount: Number(fee.refund_amount || fee.amount),
        reason: "refund",
      });
      summary.reversals += r.reversed.length;
    }

    // 4. Keep wallet pending amounts in line with the ledger.
    const { data: partners } = await supabase.from("partner_accounts").select("id").eq("status", "active");
    for (const p of partners ?? []) {
      await supabase.rpc("refresh_partner_pending", { _partner_id: p.id });
    }

    return new Response(JSON.stringify({ ...summary, timestamp: new Date().toISOString() }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[GENERATE-COMMISSIONS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } },
    );
  }
});
