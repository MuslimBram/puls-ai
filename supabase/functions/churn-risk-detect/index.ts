import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Get all active subscriptions
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("user_id, workspace_id, plan, updated_at")
      .neq("plan", "standard");

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let processed = 0;

    for (const sub of subs) {
      const signals: string[] = [];
      let riskScore = 0;

      // 1. Check last audit log activity (proxy for login)
      const { count: loginCount } = await supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", sub.user_id)
        .gte("created_at", thirtyDaysAgo.toISOString());

      const logins30d = loginCount || 0;

      // 2. Check recent leads
      const { count: recentLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sub.user_id)
        .gte("created_at", fourteenDaysAgo.toISOString());

      const { count: olderLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sub.user_id)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .lt("created_at", fourteenDaysAgo.toISOString());

      // 3. Check inbox activity
      const { count: recentInbox } = await supabase
        .from("inbox_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sub.user_id)
        .gte("created_at", fourteenDaysAgo.toISOString());

      const { count: olderInbox } = await supabase
        .from("inbox_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sub.user_id)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .lt("created_at", fourteenDaysAgo.toISOString());

      // 4. Last activity timestamp
      const { data: lastAudit } = await supabase
        .from("audit_logs")
        .select("created_at")
        .eq("actor_id", sub.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastActiveAt = lastAudit?.created_at || sub.updated_at;
      const daysInactive = Math.floor((now.getTime() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60 * 24));

      // Scoring logic
      if (daysInactive >= 14) { riskScore += 30; signals.push(`Inactive for ${daysInactive} days`); }
      else if (daysInactive >= 7) { riskScore += 15; signals.push(`Inactive for ${daysInactive} days`); }

      if (logins30d === 0) { riskScore += 25; signals.push("No logins in 30 days"); }
      else if (logins30d <= 3) { riskScore += 10; signals.push(`Only ${logins30d} logins in 30 days`); }

      const leadsTrend = (olderLeads || 0) > 0 ? ((recentLeads || 0) - (olderLeads || 0)) / (olderLeads || 1) : 0;
      if (leadsTrend < -0.5) { riskScore += 20; signals.push("Leads declining >50%"); }
      else if (leadsTrend < -0.2) { riskScore += 10; signals.push("Leads declining"); }

      const inboxTrend = (olderInbox || 0) > 0 ? ((recentInbox || 0) - (olderInbox || 0)) / (olderInbox || 1) : 0;
      if (inboxTrend < -0.5) { riskScore += 15; signals.push("Inbox activity declining >50%"); }

      // No keywords active
      const { count: activeKeywords } = await supabase
        .from("keywords")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sub.user_id)
        .eq("is_active", true);

      if ((activeKeywords || 0) === 0) { riskScore += 10; signals.push("No active keywords"); }

      // Determine risk level
      let riskLevel = "low";
      let usageTrend = "stable";
      if (riskScore >= 60) { riskLevel = "critical"; usageTrend = "declining"; }
      else if (riskScore >= 40) { riskLevel = "high"; usageTrend = "declining"; }
      else if (riskScore >= 20) { riskLevel = "medium"; usageTrend = "slowing"; }

      // Upsert churn risk
      const { data: existing } = await supabase
        .from("churn_risk_scores")
        .select("id")
        .eq("user_id", sub.user_id)
        .maybeSingle();

      const riskData = {
        user_id: sub.user_id,
        workspace_id: sub.workspace_id,
        risk_level: riskLevel,
        risk_score: Math.min(riskScore, 100),
        signals,
        last_active_at: lastActiveAt,
        days_inactive: daysInactive,
        usage_trend: usageTrend,
        leads_trend: leadsTrend,
        inbox_trend: inboxTrend,
        login_count_30d: logins30d,
        computed_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      if (existing) {
        await supabase.from("churn_risk_scores").update(riskData).eq("id", existing.id);
      } else {
        await supabase.from("churn_risk_scores").insert(riskData);
      }

      // Alert admins for high/critical risk
      if (riskLevel === "critical" || riskLevel === "high") {
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(3);

        for (const admin of admins || []) {
          // Avoid duplicate alerts (check recent)
          const { count: recentAlert } = await supabase
            .from("business_notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", admin.user_id)
            .eq("category", "churn_risk")
            .ilike("message", `%${sub.user_id}%`)
            .gte("created_at", sevenDaysAgo.toISOString());

          if ((recentAlert || 0) === 0) {
            await supabase.from("business_notifications").insert({
              user_id: admin.user_id,
              title: `Churn Risk: ${riskLevel.toUpperCase()}`,
              message: `User ${sub.user_id} has ${riskLevel} churn risk (score: ${riskScore}). Signals: ${signals.join(", ")}`,
              notification_type: "system",
              category: "churn_risk",
            });
          }
        }
      }

      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[CHURN-RISK] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
