import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REFUND_WINDOW_DAYS = 7;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Auto-approve commissions past refund window
    const windowCutoff = new Date();
    windowCutoff.setDate(windowCutoff.getDate() - REFUND_WINDOW_DAYS);

    const { data: eligibleCommissions, error: fetchErr } = await supabase
      .from("partner_commissions")
      .select("*")
      .eq("commission_status", "pending_refund_window")
      .lte("created_at", windowCutoff.toISOString());

    if (fetchErr) throw fetchErr;

    let approved = 0;

    for (const comm of (eligibleCommissions || [])) {
      // Check no pending refund for this workspace
      const { data: pendingRefund } = await supabase
        .from("subscription_refunds")
        .select("id")
        .eq("workspace_id", comm.workspace_id)
        .in("refund_status", ["requested", "approved"])
        .maybeSingle();

      if (pendingRefund) {
        console.log(`[APPROVE-COMMISSIONS] Skipping ${comm.id} - pending refund exists`);
        continue;
      }

      // Move to approved (pending admin final approval)
      const { error } = await supabase
        .from("partner_commissions")
        .update({ commission_status: "pending" })
        .eq("id", comm.id);

      if (!error) approved++;
    }

    // Also detect mass fake signups
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: partners } = await supabase
      .from("partner_accounts")
      .select("id, total_businesses")
      .eq("status", "active");

    for (const partner of (partners || [])) {
      // Check signup velocity
      const { data: recentWs } = await supabase
        .from("workspaces")
        .select("id, created_at")
        .eq("referred_by_partner_id", partner.id)
        .gte("created_at", thirtyDaysAgo.toISOString());

      if ((recentWs?.length || 0) > 10) {
        // Check how many actually have active subs
        const wsIds = (recentWs || []).map(w => w.id);
        const { count: activeSubs } = await supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .in("workspace_id", wsIds)
          .eq("subscription_status", "active");

        const conversionRate = (activeSubs || 0) / wsIds.length;
        if (conversionRate < 0.2) {
          // Flag as suspicious
          const { data: existingFlag } = await supabase
            .from("partner_risk_flags")
            .select("id")
            .eq("partner_id", partner.id)
            .eq("flag_type", "mass_fake_signups")
            .eq("is_resolved", false)
            .maybeSingle();

          if (!existingFlag) {
            await supabase.from("partner_risk_flags").insert({
              partner_id: partner.id,
              flag_type: "mass_fake_signups",
              description: `${recentWs?.length} signups in 30d, only ${((conversionRate * 100).toFixed(0))}% converted`,
              severity: "high",
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ approved, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[APPROVE-COMMISSIONS] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
