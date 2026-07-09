// supabase/functions/wallet-subscribe/index.ts
// ============================================================
// P0 FIX: Pagesa e abonimit me balancën e wallet-it të përdoruesit
// Thirret nga CompletePayment.tsx kur metoda = "wallet"
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Verifiko përdoruesin
  const { data: { user }, error: userErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (userErr || !user) return json(req, { error: "Unauthorized" }, 401);

  let body: {
    plan_key: string;
    billing_period: string;
    workspace_id?: string;
    coupon_code?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Body i pavlefshëm" }, 400);
  }

  const { plan_key, billing_period, workspace_id, coupon_code } = body;
  if (!plan_key || !billing_period) {
    return json(req, { error: "plan_key dhe billing_period janë të detyrueshme" }, 400);
  }

  try {
    // 1. Gjej planin dhe çmimin
    const { data: plan, error: planErr } = await supabase
      .from("pricing_settings")
      .select("*")
      .eq("plan_key", plan_key)
      .eq("billing_period", billing_period)
      .single();

    if (planErr || !plan) {
      return json(req, { error: `Plani '${plan_key}/${billing_period}' nuk u gjet` }, 404);
    }

    let finalPrice: number = plan.price ?? 0;

    // 2. Apliko kuponin nëse ka
    if (coupon_code) {
      const { data: coupon } = await supabase
        .from("discount_coupons")
        .select("discount_percent, discount_amount, max_uses, uses_count, expires_at")
        .eq("code", coupon_code.toUpperCase())
        .eq("active", true)
        .maybeSingle();

      if (coupon) {
        const notExpired = !coupon.expires_at || new Date(coupon.expires_at) > new Date();
        const notMaxed = !coupon.max_uses || coupon.uses_count < coupon.max_uses;
        if (notExpired && notMaxed) {
          if (coupon.discount_percent) {
            finalPrice = finalPrice * (1 - coupon.discount_percent / 100);
          } else if (coupon.discount_amount) {
            finalPrice = Math.max(0, finalPrice - coupon.discount_amount);
          }
        }
      }
    }

    finalPrice = Math.round(finalPrice * 100) / 100; // rrumbullakoset në 2 shifra

    // 3. Kontrollo balancën e wallet-it
    const { data: wallet, error: walletErr } = await supabase
      .from("user_wallets")
      .select("id, current_balance, currency")
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletErr || !wallet) {
      return json(req, { error: "Wallet nuk u gjet. Kontakto mbështetjen." }, 404);
    }

    if (wallet.current_balance < finalPrice) {
      return json(req, {
        error: `Balancë e pamjaftueshme. Keni €${wallet.current_balance.toFixed(2)}, nevojiten €${finalPrice.toFixed(2)}.`,
        code: "INSUFFICIENT_BALANCE",
        balance: wallet.current_balance,
        required: finalPrice,
      }, 402);
    }

    // 4. Zbrit balancën (transaksion atomik)
    const { error: deductErr } = await supabase.rpc("deduct_wallet_balance", {
      p_user_id: user.id,
      p_amount: finalPrice,
      p_description: `Abonim ${plan_key} (${billing_period}) — Pulse AI`,
    });

    if (deductErr) {
      // Fallback: update manualisht nëse RPC nuk ekziston
      const { error: updateErr } = await supabase
        .from("user_wallets")
        .update({
          current_balance: wallet.current_balance - finalPrice,
          lifetime_withdrawals: (wallet as unknown as Record<string, number>).lifetime_withdrawals + finalPrice,
        })
        .eq("id", wallet.id);

      if (updateErr) throw new Error(`Zbritja e balancës dështoi: ${updateErr.message}`);
    }

    // 5. Krijoni ose përditëso abonimin
    const periodMap: Record<string, number> = {
      monthly: 30, quarterly: 90, biannual: 180, annual: 365
    };
    const days = periodMap[billing_period] ?? 30;
    const endsAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();

    const targetUserId = workspace_id ? null : user.id; // workspace logic nëse nevojitet

    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let subscriptionId: string;

    if (existingSub) {
      await supabase
        .from("subscriptions")
        .update({
          plan: plan_key,
          status: "active",
          billing_period,
          current_period_start: new Date().toISOString(),
          current_period_end: endsAt,
          amount: finalPrice,
          payment_method: "wallet",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSub.id);
      subscriptionId = existingSub.id;
    } else {
      const { data: newSub } = await supabase
        .from("subscriptions")
        .insert({
          user_id: user.id,
          plan: plan_key,
          status: "active",
          billing_period,
          current_period_start: new Date().toISOString(),
          current_period_end: endsAt,
          amount: finalPrice,
          payment_method: "wallet",
        })
        .select("id")
        .single();
      subscriptionId = newSub?.id ?? "";
    }

    // 6. Regjistro transaksionin
    await supabase.from("wallet_transactions").insert({
      wallet_id: wallet.id,
      user_id: user.id,
      type: "subscription_payment",
      amount: -finalPrice,
      description: `Abonim ${plan_key} (${billing_period})`,
      reference_id: subscriptionId,
      balance_after: wallet.current_balance - finalPrice,
    }).catch(() => {}); // jo kritike nëse tabela nuk ekziston

    // 7. Përditëso rolin e përdoruesit (nëse plan ndryshon)
    await supabase.from("user_roles").upsert({
      user_id: user.id,
      role: "subscriber",
    }, { onConflict: "user_id,role" }).catch(() => {});

    return json(req, {
      success: true,
      message: `Abonimit ${plan_key} u aktivizua me sukses.`,
      subscription_id: subscriptionId,
      amount_charged: finalPrice,
      wallet_balance_after: wallet.current_balance - finalPrice,
      period_ends_at: endsAt,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("wallet-subscribe error:", msg);
    return json(req, { success: false, error: msg }, 500);
  }
});
