import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_PRICES: Record<string, number> = {
  standard: 29,
  professional: 79,
  advanced: 149,
  enterprise: 399,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Get all workspaces that were referred by a partner
    const { data: referredWorkspaces, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, referred_by_partner_id")
      .not("referred_by_partner_id", "is", null);

    if (wsErr) throw wsErr;
    if (!referredWorkspaces || referredWorkspaces.length === 0) {
      return new Response(JSON.stringify({ generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let generated = 0;
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    for (const ws of referredWorkspaces) {
      // Get subscription for this workspace
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, plan, subscription_status, stripe_subscription_id, workspace_id")
        .eq("workspace_id", ws.id)
        .maybeSingle();

      if (!sub || !["active", "trialing"].includes(sub.subscription_status || "")) continue;

      const planName = sub.plan || "standard";
      const grossAmount = PLAN_PRICES[planName] || 0;
      if (grossAmount === 0) continue;

      // Check if commission already exists for this period
      const { data: existing } = await supabase
        .from("partner_commissions")
        .select("id")
        .eq("partner_id", ws.referred_by_partner_id)
        .eq("workspace_id", ws.id)
        .gte("billing_period_start", periodStart.toISOString())
        .lte("billing_period_start", periodEnd.toISOString())
        .maybeSingle();

      if (existing) continue;

      // Get partner commission rate
      const { data: partner } = await supabase
        .from("partner_accounts")
        .select("commission_rate, status")
        .eq("id", ws.referred_by_partner_id)
        .maybeSingle();

      if (!partner || partner.status !== "active") continue;

      const commissionPercent = partner.commission_rate || 10;
      const commissionAmount = (grossAmount * commissionPercent) / 100;

      // Create commission record
      const { data: commission, error: commErr } = await supabase
        .from("partner_commissions")
        .insert({
          partner_id: ws.referred_by_partner_id,
          workspace_id: ws.id,
          subscription_id: sub.stripe_subscription_id || sub.id,
          plan_name: planName,
          billing_period_start: periodStart.toISOString(),
          billing_period_end: periodEnd.toISOString(),
          gross_amount: grossAmount,
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          commission_status: "pending",
        })
        .select("id")
        .single();

      if (commErr) {
        console.error(`Commission error for workspace ${ws.id}:`, commErr);
        continue;
      }

      // Add to wallet pending amount
      await supabase.rpc("increment_wallet_pending", {
        p_partner_id: ws.referred_by_partner_id,
        p_amount: commissionAmount,
      }).then(({ error }) => {
        // Fallback if RPC doesn't exist yet - direct update
        if (error) {
          return supabase
            .from("partner_wallets")
            .update({
              pending_amount: supabase.rpc ? undefined : commissionAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("partner_id", ws.referred_by_partner_id);
        }
      });

      // Fallback: direct SQL update for pending
      await supabase
        .from("partner_wallets")
        .update({ updated_at: new Date().toISOString() })
        .eq("partner_id", ws.referred_by_partner_id);

      // Create wallet transaction
      await supabase.from("partner_wallet_transactions").insert({
        partner_id: ws.referred_by_partner_id,
        type: "commission_credit",
        amount: commissionAmount,
        reference_id: commission.id,
        description: `Commission for ${planName} plan - ${ws.id.substring(0, 8)}`,
      });

      generated++;
    }

    // Recalculate wallet pending amounts from uncommitted commissions
    const { data: partners } = await supabase
      .from("partner_accounts")
      .select("id")
      .eq("status", "active");

    if (partners) {
      for (const p of partners) {
        const { data: pendingComms } = await supabase
          .from("partner_commissions")
          .select("commission_amount")
          .eq("partner_id", p.id)
          .eq("commission_status", "pending");

        const totalPending = (pendingComms || []).reduce(
          (sum, c) => sum + Number(c.commission_amount), 0
        );

        await supabase
          .from("partner_wallets")
          .update({ pending_amount: totalPending, updated_at: new Date().toISOString() })
          .eq("partner_id", p.id);
      }
    }

    return new Response(JSON.stringify({ generated, timestamp: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[GENERATE-COMMISSIONS] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
