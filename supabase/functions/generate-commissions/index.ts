import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

/**
 * First-payment-only commission generator.
 *
 * Rule: a partner earns commission ONLY on the first successful paid invoice
 * of each referred workspace. Renewals, upgrades, and recurring payments
 * never generate a commission.
 *
 * This function is idempotent: it scans for referred workspaces that have
 * recorded a paid invoice but do not yet have a first-payment commission row,
 * and creates exactly one commission per (partner, workspace). The unique
 * partial index `partner_commissions_first_payment_unique` is the final guard.
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

  try {
    // Keep referral lifecycle statuses in sync first.
    await supabase.rpc("sync_referral_statuses").catch(() => {});

    // 1. All workspaces with a partner referrer.
    const { data: referredWorkspaces, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, referred_by_partner_id")
      .not("referred_by_partner_id", "is", null);

    if (wsErr) throw wsErr;
    if (!referredWorkspaces || referredWorkspaces.length === 0) {
      return new Response(JSON.stringify({ generated: 0 }), {
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    let generated = 0;
    const now = new Date();

    for (const ws of referredWorkspaces) {
      const partnerId = ws.referred_by_partner_id as string;

      // 2. Skip if a first-payment commission already exists for this workspace.
      const { data: existing } = await supabase
        .from("partner_commissions")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("workspace_id", ws.id)
        .eq("is_first_payment", true)
        .maybeSingle();
      if (existing) continue;

      // 3. Find the earliest successful payment for this workspace.
      //    Prefer billing_history (provider-agnostic); fall back to paypal_transactions.
      let firstInvoice:
        | { id: string; amount: number; created_at: string; reference: string | null }
        | null = null;

      const { data: billRow } = await supabase
        .from("billing_history")
        .select("id, amount, status, created_at, invoice_id, transaction_reference")
        .eq("workspace_id", ws.id)
        .in("status", ["completed", "paid", "succeeded"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (billRow) {
        firstInvoice = {
          id: billRow.id,
          amount: Number(billRow.amount) || 0,
          created_at: billRow.created_at,
          reference: (billRow as any).invoice_id || (billRow as any).transaction_reference || null,
        };
      } else {
        const { data: ppRow } = await supabase
          .from("paypal_transactions")
          .select("id, amount, status, created_at, paypal_order_id")
          .eq("workspace_id", ws.id)
          .in("status", ["completed", "COMPLETED", "captured", "CAPTURED"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (ppRow) {
          firstInvoice = {
            id: ppRow.id,
            amount: Number(ppRow.amount) || 0,
            created_at: ppRow.created_at,
            reference: (ppRow as any).paypal_order_id || ppRow.id,
          };
        }
      }

      if (!firstInvoice || firstInvoice.amount <= 0) continue;

      // 4. Verify partner is active.
      const { data: partner } = await supabase
        .from("partner_accounts")
        .select("commission_rate, status")
        .eq("id", partnerId)
        .maybeSingle();
      if (!partner || partner.status !== "active") continue;

      // 5. Pull subscription plan label for the commission record.
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, plan, stripe_subscription_id")
        .eq("workspace_id", ws.id)
        .maybeSingle();

      const planName = sub?.plan || "standard";
      const commissionPercent = partner.commission_rate || 10;
      const grossAmount = firstInvoice.amount;
      const commissionAmount = (grossAmount * commissionPercent) / 100;
      const sourceInvoiceId = firstInvoice.reference || firstInvoice.id;

      // 6. Insert the single first-payment commission. The unique partial
      //    index will reject any race-condition duplicates.
      const { data: commission, error: commErr } = await supabase
        .from("partner_commissions")
        .insert({
          partner_id: partnerId,
          workspace_id: ws.id,
          subscription_id: sub?.stripe_subscription_id || sub?.id || null,
          plan_name: planName,
          billing_period_start: firstInvoice.created_at,
          billing_period_end: firstInvoice.created_at,
          gross_amount: grossAmount,
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          commission_status: "pending",
          is_first_payment: true,
          source_invoice_id: sourceInvoiceId,
        })
        .select("id")
        .single();

      if (commErr) {
        // Duplicate-key is fine (created by a concurrent run/webhook).
        if (!String(commErr.message || "").includes("duplicate")) {
          console.error(`[GENERATE-COMMISSIONS] Insert error for ws ${ws.id}:`, commErr);
        }
        continue;
      }

      // 7. Ledger entry.
      await supabase.from("partner_wallet_transactions").insert({
        partner_id: partnerId,
        type: "commission_credit",
        amount: commissionAmount,
        reference_id: commission.id,
        description: `First-payment commission · ${planName} · ws ${ws.id.substring(0, 8)}`,
      });

      generated++;
    }

    // 8. Recompute pending balances per partner from authoritative commission rows.
    const { data: partners } = await supabase
      .from("partner_accounts")
      .select("id")
      .eq("status", "active");

    for (const p of partners || []) {
      const { data: pendingComms } = await supabase
        .from("partner_commissions")
        .select("commission_amount")
        .eq("partner_id", p.id)
        .eq("commission_status", "pending");

      const totalPending = (pendingComms || []).reduce(
        (sum, c) => sum + Number(c.commission_amount || 0),
        0,
      );

      await supabase
        .from("partner_wallets")
        .update({ pending_amount: totalPending, updated_at: new Date().toISOString() })
        .eq("partner_id", p.id);
    }

    return new Response(JSON.stringify({ generated, timestamp: now.toISOString() }), {
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
