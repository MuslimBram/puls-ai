import { corsHeaders } from "../_shared/security-headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/admin-client.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = getServiceKey() ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { withdrawal_request_id } = await req.json();

    // Get the withdrawal request
    const { data: wr, error: wrError } = await supabaseClient
      .from("withdrawal_requests")
      .select("*")
      .eq("id", withdrawal_request_id)
      .single();

    if (wrError || !wr) {
      return new Response(JSON.stringify({ error: "Withdrawal request not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: ownership check — admins may inspect any request,
    // otherwise the caller must own the withdrawal request.
    const { data: isAdmin } = await supabaseClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuper } = await supabaseClient.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (wr.user_id !== user.id && !isAdmin && !isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Get user profile and wallet history
    const [profileRes, walletRes, txRes, recentWithdrawals] = await Promise.all([
      supabaseClient.from("profiles").select("*").eq("user_id", wr.user_id).single(),
      supabaseClient.from("user_wallets").select("*").eq("id", wr.wallet_id).single(),
      supabaseClient.from("user_wallet_transactions").select("*").eq("wallet_id", wr.wallet_id).order("created_at", { ascending: false }).limit(20),
      supabaseClient.from("withdrawal_requests").select("*").eq("user_id", wr.user_id).eq("status", "approved").order("created_at", { ascending: false }).limit(10),
    ]);

    const profile = profileRes.data;
    const wallet = walletRes.data;
    const transactions = txRes.data ?? [];
    const pastWithdrawals = recentWithdrawals.data ?? [];

    // Build AI prompt
    const prompt = `You are a fraud detection AI for a SaaS platform. Analyze this withdrawal request and return a JSON object with "risk_score" (0-100) and "reason" (string).

Withdrawal Request:
- Amount: ${wr.amount} ${wr.currency}
- User: ${profile?.full_name ?? "Unknown"} (ID: ${wr.user_id})
- Account created: ${profile?.created_at ?? "Unknown"}
- Wallet balance: ${wallet?.current_balance ?? 0} ${wallet?.currency ?? wr.currency}
- Lifetime deposits: ${wallet?.lifetime_deposits ?? 0}
- Lifetime withdrawals: ${wallet?.lifetime_withdrawals ?? 0}
- Recent transactions (last 20): ${JSON.stringify(transactions.map(t => ({ type: t.type, amount: t.amount, date: t.created_at })))}
- Past approved withdrawals (last 10): ${JSON.stringify(pastWithdrawals.map(w => ({ amount: w.amount, date: w.created_at })))}

Risk factors to check:
1. Withdrawal amount > 80% of balance = suspicious
2. New account (< 7 days) with large withdrawal = high risk
3. Multiple withdrawals in 24h = suspicious
4. Withdrawal > lifetime deposits = very suspicious
5. Amount > 500 on first withdrawal = moderate risk

Return ONLY valid JSON: {"risk_score": number, "reason": "explanation"}`;

    // Call AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a financial fraud detection AI. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    let riskScore = 50;
    let riskReason = "AI analysis unavailable";

    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(content);
        riskScore = Math.min(100, Math.max(0, Number(parsed.risk_score) || 50));
        riskReason = parsed.reason || "No specific reason";
      } catch {
        riskReason = "Failed to parse AI response";
      }
    }

    // Determine next status
    const nextStatus = riskScore >= 80 ? "blocked" : riskScore >= 50 ? "pending_admin_review" : "pending_admin_review";
    // All withdrawals require admin approval, but high-risk ones are flagged

    // Update withdrawal request
    await supabaseClient
      .from("withdrawal_requests")
      .update({
        ai_risk_score: riskScore,
        ai_risk_reason: riskReason,
        ai_reviewed_at: new Date().toISOString(),
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal_request_id);

    return new Response(JSON.stringify({
      risk_score: riskScore,
      risk_reason: riskReason,
      status: nextStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
