import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { routerChatCompletion } from "../_shared/router-chat-compat.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = getServiceKey()!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── FAZA 0 / V9a — AUTHORIZATION ─────────────────────────────────────────
    // This endpoint runs with the SERVICE ROLE key and writes ai_fraud_score /
    // ai_fraud_reasons onto payout_requests. Before this change it had NO
    // authentication of any kind: the only barrier was the gateway's verify_jwt,
    // and the anon/publishable key shipped in the frontend bundle is a valid
    // JWT. Any holder of that public key could therefore overwrite the fraud
    // verdict on ANY payout request in the table.
    //
    // Guard model mirrors withdrawal-fraud-check (the best-guarded function on
    // this surface): the caller must be the OWNER of the payout request's
    // partner account, or an admin / super_admin. Owner access is required
    // because useRequestPayout() invokes this immediately after a partner
    // creates their own payout request — an admin-only guard would break that
    // legitimate flow.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }
    const { data: authData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const caller = authData?.user;
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const { payout_request_id } = await req.json();
    if (!payout_request_id) throw new Error("payout_request_id required");

    // Fetch payout request
    const { data: payout, error: pErr } = await supabase
      .from("payout_requests")
      .select("*")
      .eq("id", payout_request_id)
      .single();
    if (pErr || !payout) throw new Error("Payout request not found");

    // Fetch partner data
    const { data: partner } = await supabase
      .from("partner_accounts")
      .select("*")
      .eq("id", payout.partner_id)
      .single();

    // ── FAZA 0 / V9a — owner-or-admin check ──────────────────────────────────
    // Resolved here because ownership is only knowable once the payout request
    // and its partner account have been loaded. Note the ordering consequence,
    // stated plainly rather than papered over: the "not found" branch above
    // runs before this check, so an authenticated caller can still distinguish
    // a non-existent payout id from one they may not touch. payout_request ids
    // are v4 UUIDs, so this is not a practical enumeration vector, and closing
    // it would mean withholding "not found" from admins who legitimately need
    // it. Flagged as accepted residual risk, not as an oversight.
    const { data: callerRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "super_admin"]);
    if (rolesError) throw new Error(`role lookup failed: ${rolesError.message}`);

    const isPlatformStaff = (callerRoles ?? []).length > 0;
    const isPartnerOwner = !!partner?.user_id && partner.user_id === caller.id;
    if (!isPlatformStaff && !isPartnerOwner) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // Fetch wallet
    const { data: wallet } = await supabase
      .from("partner_wallets")
      .select("*")
      .eq("partner_id", payout.partner_id)
      .single();

    // Fetch recent commissions
    const { data: commissions } = await supabase
      .from("partner_commissions")
      .select("*")
      .eq("partner_id", payout.partner_id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch recent payouts
    const { data: recentPayouts } = await supabase
      .from("payout_requests")
      .select("*")
      .eq("partner_id", payout.partner_id)
      .neq("id", payout_request_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Build context for AI analysis
    const context = {
      payout_amount: payout.requested_amount,
      wallet_balance: wallet?.current_balance ?? 0,
      lifetime_earnings: wallet?.lifetime_earnings ?? 0,
      pending_amount: wallet?.pending_amount ?? 0,
      partner_status: partner?.status ?? "unknown",
      partner_created_at: partner?.created_at,
      total_businesses: partner?.total_businesses ?? 0,
      total_commissions: commissions?.length ?? 0,
      total_commission_value: commissions?.reduce((s: number, c: any) => s + (c.commission_amount || 0), 0) ?? 0,
      approved_commissions: commissions?.filter((c: any) => c.commission_status === "approved").length ?? 0,
      pending_commissions: commissions?.filter((c: any) => c.commission_status === "pending").length ?? 0,
      recent_payout_count: recentPayouts?.length ?? 0,
      recent_payout_total: recentPayouts?.reduce((s: number, p: any) => s + (p.requested_amount || 0), 0) ?? 0,
      bank_name: payout.bank_name,
      bank_iban: payout.bank_iban,
      beneficiary_name: payout.beneficiary_name,
    };

    let fraudScore = -1;
    let fraudReasons: string[] = [];

    {
      // Use AI to analyze
      const aiResponse = await routerChatCompletion({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are a fraud detection AI for a SaaS platform's payout system. Analyze the withdrawal request and return a JSON object with:
- "score": number 0-100 (0=safe, 100=definite fraud)
- "reasons": string[] of specific concerns found
- "recommendation": "approve" | "review" | "reject"

Consider these red flags:
- Requesting more than wallet balance
- New account with high payout requests
- Many pending/unapproved commissions
- Rapid successive payout requests
- Mismatched beneficiary name
- Unusually high amounts relative to earnings history
- No real business referrals but claiming commissions

Return ONLY valid JSON, no markdown.`,
            },
            {
              role: "user",
              content: `Analyze this withdrawal request:\n${JSON.stringify(context, null, 2)}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }, { workspaceId: payout.workspace_id || partner?.workspace_id || undefined, userId: payout.user_id || partner?.user_id || undefined, taskType: "balanced", allowInternalNoWorkspace: !(payout.workspace_id || partner?.workspace_id) });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || "";
        try {
          const parsed = JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
          fraudScore = parsed.score ?? 0;
          fraudReasons = parsed.reasons ?? [];
        } catch {
          // Fallback to rule-based
          fraudScore = -1;
        }
      }
    }

    // Rule-based fallback/supplement
    if (fraudScore < 0) {
      fraudScore = 0;
      fraudReasons = [];

      if (payout.requested_amount > (wallet?.current_balance ?? 0)) {
        fraudScore += 40;
        fraudReasons.push("Shuma e kërkuar tejkalon balancën aktuale");
      }
      if ((partner?.total_businesses ?? 0) === 0) {
        fraudScore += 25;
        fraudReasons.push("Nuk ka biznese të referuara por kërkon tërheqje");
      }
      if ((recentPayouts?.length ?? 0) >= 3) {
        fraudScore += 15;
        fraudReasons.push("Shumë kërkesa tërheqjeje në periudhë të shkurtër");
      }
      const accountAgeDays = partner?.created_at
        ? (Date.now() - new Date(partner.created_at).getTime()) / 86400000
        : 0;
      if (accountAgeDays < 7 && payout.requested_amount > 100) {
        fraudScore += 20;
        fraudReasons.push("Llogari e re me tërheqje të lartë");
      }
      if (fraudReasons.length === 0) {
        fraudReasons.push("Asnjë sinjal i dyshimtë nuk u gjet");
      }
    }

    fraudScore = Math.min(100, Math.max(0, fraudScore));

    // Update payout request with AI analysis
    await supabase
      .from("payout_requests")
      .update({
        ai_fraud_score: fraudScore,
        ai_fraud_reasons: fraudReasons,
        ai_reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", payout_request_id);

    return new Response(
      JSON.stringify({ score: fraudScore, reasons: fraudReasons, recommendation: fraudScore > 60 ? "reject" : fraudScore > 30 ? "review" : "approve" }),
      { headers: { ...getCors(req), "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
