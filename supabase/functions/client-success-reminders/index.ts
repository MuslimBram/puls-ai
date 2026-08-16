// supabase/functions/client-success-reminders/index.ts
// ============================================================
// Dërgon reminder automatik — thirret nga cron çdo ditë 09:00
// Zbaton reminder_rules: 7 ditë, 14 ditë, 30 ditë pas blerjes,
// trial ending, renewal approaching, etj.
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function renderTemplate(tmpl: string, data: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? "");
}

serve(async (_req: Request): Promise<Response> => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  const now = new Date();
  let sent = 0, skipped = 0, failed = 0;

  try {
    const { data: rules } = await supabase
      .from("reminder_rules")
      .select("*")
      .eq("is_active", true);

    for (const rule of rules ?? []) {
      // Gjej kontaktet që i përgjigjen këtij rregulli
      let contacts: Array<Record<string, string>> = [];

      if (rule.trigger_event === "purchase_made") {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - rule.delay_days);
        const { data } = await supabase
          .from("subscriptions")
          .select("user_id, created_at, plan")
          .eq("status", "active")
          .gte("created_at", new Date(targetDate.setHours(0,0,0,0)).toISOString())
          .lte("created_at", new Date(targetDate.setHours(23,59,59,999)).toISOString());
        contacts = (data ?? []).map((s: Record<string, string>) => ({ user_id: s.user_id, plan: s.plan }));
      }

      if (rule.trigger_event === "trial_ending") {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + rule.delay_days);
        const { data } = await supabase
          .from("subscriptions")
          .select("user_id, trial_end")
          .in("status", ["trialing","trial"])
          .gte("trial_end", new Date(targetDate.setHours(0,0,0,0)).toISOString())
          .lte("trial_end", new Date(targetDate.setHours(23,59,59,999)).toISOString());
        contacts = (data ?? []).map((s: Record<string, string>) => ({ user_id: s.user_id }));
      }

      if (rule.trigger_event === "subscription_renewing") {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + rule.delay_days);
        const { data } = await supabase
          .from("subscriptions")
          .select("user_id, current_period_end, plan")
          .eq("status", "active")
          .gte("current_period_end", new Date(targetDate.setHours(0,0,0,0)).toISOString())
          .lte("current_period_end", new Date(targetDate.setHours(23,59,59,999)).toISOString());
        contacts = (data ?? []).map((s: Record<string, string>) => ({ user_id: s.user_id, plan: s.plan }));
      }

      if (rule.trigger_event === "no_activity") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - rule.delay_days);
        const { data } = await supabase
          .from("onboarding_progress")
          .select("user_id")
          .lt("completion_pct", 50)
          .lt("started_at", cutoff.toISOString());
        contacts = (data ?? []).map((o: Record<string, string>) => ({ user_id: o.user_id }));
      }

      // Dërgo reminder për çdo kontakt
      for (const contact of contacts) {
        if (!contact.user_id) continue;

        // Kontrollo nëse e kemi dërguar sot
        const { data: existing } = await supabase
          .from("reminder_log")
          .select("id")
          .eq("rule_id", rule.id)
          .eq("user_id", contact.user_id)
          .gte("sent_at", new Date().toISOString().split("T")[0])
          .maybeSingle();

        if (existing) { skipped++; continue; }

        // Merr emailin e përdoruesit
        const { data: userData } = await supabase.auth.admin.getUserById(contact.user_id);
        const email = userData?.user?.email;
        const name = userData?.user?.user_metadata?.full_name ?? "Miku";
        if (!email) { skipped++; continue; }

        const data: Record<string, string> = {
          name,
          email,
          plan: contact.plan ?? "",
          days: String(rule.delay_days),
        };

        let body = renderTemplate(rule.body_template ?? "", data);
        const subject = renderTemplate(rule.subject ?? "Njoftim nga Pulse AI", data);

        // Dërgo
        let success = false;
        if (rule.channel === "email") {
          const res = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getServiceKey()}`,
              },
              body: JSON.stringify({ to: email, subject, html: body.replace(/\n/g, "<br>") }),
            }
          );
          success = res.ok;
        }

        // Log
        await supabase.from("reminder_log").insert({
          rule_id: rule.id,
          user_id: contact.user_id,
          contact_email: email,
          trigger_event: rule.trigger_event,
          channel: rule.channel,
          status: success ? "sent" : "failed",
        }).catch(() => {});

        if (success) sent++;
        else failed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, skipped, failed }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
