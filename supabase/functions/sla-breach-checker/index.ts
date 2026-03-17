import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const now = new Date();

    // 1. Get all workspaces with SLA configs
    const { data: slaConfigs, error: slaErr } = await supabase
      .from("sla_configs")
      .select("*")
      .eq("is_active", true);

    if (slaErr) throw slaErr;

    let breached = 0;
    let checked = 0;
    let escalated = 0;

    for (const sla of slaConfigs || []) {
      // 2. Find open threads for this workspace
      const { data: threads, error: thErr } = await supabase
        .from("conversation_threads")
        .select("id, created_at, first_response_at, last_message_at, status, sla_breached, assigned_to, user_id")
        .in("status", ["new", "open", "pending"])
        .limit(200);

      if (thErr) { console.error("Thread fetch error:", thErr); continue; }

      for (const thread of threads || []) {
        checked++;
        const createdAt = new Date(thread.created_at);
        const lastMsg = new Date(thread.last_message_at || thread.created_at);

        // First response SLA
        const frDue = new Date(createdAt.getTime() + sla.first_response_minutes * 60000);
        const frBreached = !thread.first_response_at && now > frDue;

        // Next response SLA
        const nrDue = new Date(lastMsg.getTime() + sla.next_response_minutes * 60000);
        const nrBreached = now > nrDue && thread.status !== "resolved";

        // Resolution SLA
        const resDue = new Date(createdAt.getTime() + sla.resolution_minutes * 60000);
        const resBreached = now > resDue;

        const isBreached = frBreached || nrBreached || resBreached;

        if (isBreached && !thread.sla_breached) {
          breached++;

          await supabase
            .from("conversation_threads")
            .update({
              sla_breached: true,
              sla_response_due: frBreached ? frDue.toISOString() : undefined,
              next_response_due: nrDue.toISOString(),
              resolution_due: resDue.toISOString(),
            })
            .eq("id", thread.id);

          // 3. Escalation: notify assigned agent + workspace admins
          const notifyUsers: string[] = [];
          if (thread.assigned_to) notifyUsers.push(thread.assigned_to);
          if (thread.user_id && !notifyUsers.includes(thread.user_id)) {
            notifyUsers.push(thread.user_id);
          }

          const breachType = frBreached ? "First Response" : nrBreached ? "Next Response" : "Resolution";

          for (const uid of notifyUsers) {
            await supabase.from("business_notifications").insert({
              user_id: uid,
              title: `⚠️ SLA Breach: ${breachType}`,
              message: `Thread ${thread.id.slice(0, 8)} has breached the ${breachType} SLA. Please respond immediately.`,
              notification_type: "system",
              category: "alert",
              action_url: "/helpdesk",
            });
          }

          escalated++;
        }
      }
    }

    // 4. Auto-clear breaches for resolved threads (cleanup)
    const { error: clearErr } = await supabase
      .from("conversation_threads")
      .update({ sla_breached: false })
      .eq("sla_breached", true)
      .in("status", ["resolved", "closed"]);

    if (clearErr) console.error("Clear breach error:", clearErr);

    return new Response(JSON.stringify({
      ok: true,
      checked,
      breached,
      escalated,
      sla_configs_active: (slaConfigs || []).length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[SLA-BREACH-CHECKER] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
