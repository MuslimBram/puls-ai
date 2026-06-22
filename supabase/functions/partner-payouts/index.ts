import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) throw new Error("Unauthorized");

    const { action, partner_id, payout_request_id, amount } = await req.json();

    // SECURITY: For any action scoped to a partner_id, verify the caller
    // owns that partner_account. Without this check, any authenticated
    // user could onboard or drain another partner's wallet (IDOR).
    async function assertOwnsPartner(pid: string) {
      if (!pid) throw new Error("partner_id required");
      const { data: p, error } = await supabase
        .from("partner_accounts")
        .select("id, user_id")
        .eq("id", pid)
        .maybeSingle();
      if (error) throw new Error(`Partner lookup failed: ${error.message}`);
      if (!p) throw new Error("Partner not found");
      if (p.user_id !== userData.user.id) {
        const err: any = new Error("Forbidden: you do not own this partner account");
        err.status = 403;
        throw err;
      }
      return p;
    }

    switch (action) {
      // Partner requests Stripe Connect onboarding
      case "connect_onboard": {
        await assertOwnsPartner(partner_id);
        const { data: partner } = await supabase
          .from("partner_accounts")
          .select("*")
          .eq("id", partner_id)
          .single();
        if (!partner) throw new Error("Partner not found");

        let stripeAccountId = partner.stripe_connect_id;

        if (!stripeAccountId) {
          const account = await stripe.accounts.create({
            type: "express",
            email: userData.user.email,
            capabilities: {
              transfers: { requested: true },
            },
          });
          stripeAccountId = account.id;

          await supabase
            .from("partner_accounts")
            .update({ stripe_connect_id: stripeAccountId })
            .eq("id", partner_id);
        }

        const accountLink = await stripe.accountLinks.create({
          account: stripeAccountId,
          refresh_url: `${req.headers.get("origin")}/partner`,
          return_url: `${req.headers.get("origin")}/partner?onboarded=true`,
          type: "account_onboarding",
        });

        return new Response(JSON.stringify({ url: accountLink.url }), {
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      // Partner requests a payout
      case "request_payout": {
        await assertOwnsPartner(partner_id);
        if (!amount || amount < 10) throw new Error("Minimum payout is $10");

        const { data: wallet } = await supabase
          .from("partner_wallets")
          .select("*")
          .eq("partner_id", partner_id)
          .single();

        if (!wallet || wallet.available_balance < amount) {
          throw new Error("Insufficient balance");
        }

        // Create payout request
        const { data: payoutReq, error: prErr } = await supabase
          .from("payout_requests")
          .insert({
            partner_id,
            amount,
            currency: "usd",
            status: "pending",
            requested_by: userData.user.id,
          })
          .select()
          .single();
        if (prErr) throw prErr;

        // Lock funds
        await supabase
          .from("partner_wallets")
          .update({
            pending_balance: (wallet.pending_balance || 0) + amount,
            available_balance: wallet.available_balance - amount,
          })
          .eq("partner_id", partner_id);

        return new Response(JSON.stringify({ payout_request: payoutReq }), {
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      // Admin approves payout → execute Stripe transfer
      case "approve_payout": {
        // Verify admin role
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id);
        const isAdmin = roles?.some(r => r.role === "admin" || r.role === "super_admin");
        if (!isAdmin) throw new Error("Admin only");

        const { data: payoutReq } = await supabase
          .from("payout_requests")
          .select("*, partner_accounts!inner(stripe_connect_id)")
          .eq("id", payout_request_id)
          .single();

        if (!payoutReq) throw new Error("Payout request not found");
        if (payoutReq.status !== "pending") throw new Error("Already processed");

        const connectId = (payoutReq as any).partner_accounts?.stripe_connect_id;

        if (connectId) {
          // Execute real Stripe transfer
          try {
            await stripe.transfers.create({
              amount: Math.round(payoutReq.amount * 100),
              currency: payoutReq.currency || "usd",
              destination: connectId,
              description: `Partner payout #${payoutReq.id}`,
            });

            await supabase
              .from("payout_requests")
              .update({ status: "completed", processed_at: new Date().toISOString() })
              .eq("id", payout_request_id);
          } catch (stripeErr: any) {
            // Failed — move to retry
            await supabase
              .from("payout_requests")
              .update({ status: "failed", notes: stripeErr.message })
              .eq("id", payout_request_id);

            // Return funds to available
            const { data: wallet } = await supabase
              .from("partner_wallets")
              .select("*")
              .eq("partner_id", payoutReq.partner_id)
              .single();

            if (wallet) {
              await supabase
                .from("partner_wallets")
                .update({
                  pending_balance: Math.max(0, (wallet.pending_balance || 0) - payoutReq.amount),
                  available_balance: wallet.available_balance + payoutReq.amount,
                })
                .eq("partner_id", payoutReq.partner_id);
            }

            throw new Error(`Stripe transfer failed: ${stripeErr.message}`);
          }
        } else {
          // Manual payout tracking (no Stripe Connect)
          await supabase
            .from("payout_requests")
            .update({ status: "approved_manual", processed_at: new Date().toISOString() })
            .eq("id", payout_request_id);
        }

        // Deduct from pending
        const { data: wallet } = await supabase
          .from("partner_wallets")
          .select("*")
          .eq("partner_id", payoutReq.partner_id)
          .single();

        if (wallet) {
          await supabase
            .from("partner_wallets")
            .update({
              pending_balance: Math.max(0, (wallet.pending_balance || 0) - payoutReq.amount),
              total_withdrawn: (wallet.total_withdrawn || 0) + payoutReq.amount,
            })
            .eq("partner_id", payoutReq.partner_id);
        }

        // Audit log
        await supabase.from("audit_logs").insert({
          actor_id: userData.user.id,
          action: "payout_approved",
          target_type: "payout_request",
          target_id: payout_request_id,
          metadata: { amount: payoutReq.amount, partner_id: payoutReq.partner_id },
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...getCors(req), "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("Partner payout error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
