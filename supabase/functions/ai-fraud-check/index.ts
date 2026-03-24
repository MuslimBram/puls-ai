import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

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

    let fraudScore = 0;
    let fraudReasons: string[] = [];

    if (lovableKey) {
      // Use AI to analyze
      const aiResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({
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
        }),
      });

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
    if (fraudScore < 0 || !lovableKey) {
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
