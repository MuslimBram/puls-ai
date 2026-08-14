// process-drip-emails: cron-driven scheduler for onboarding drip + trial extension.
// Runs every hour. Idempotent via drip_email_log unique (user_id, template_name).
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { requireCronAuth } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface DripRule {
  template: string;
  minDaysSinceSignup: number;
  maxDaysSinceSignup: number;
  buildData: (sub: any, user: any) => Record<string, any>;
}

const RULES: DripRule[] = [
  { template: "drip-day1-welcome", minDaysSinceSignup: 1, maxDaysSinceSignup: 2, buildData: (_s, u) => ({ name: u?.raw_user_meta_data?.full_name }) },
  { template: "drip-day3-quickwins", minDaysSinceSignup: 3, maxDaysSinceSignup: 4, buildData: (_s, u) => ({ name: u?.raw_user_meta_data?.full_name, completedSteps: 0 }) },
  { template: "drip-day5-usecases", minDaysSinceSignup: 5, maxDaysSinceSignup: 6, buildData: (_s, u) => ({ name: u?.raw_user_meta_data?.full_name }) },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const unauth = requireCronAuth(req);
  if (unauth) return new Response(unauth.body, { status: unauth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  let processed = 0;
  let extended = 0;
  let failed = 0;

  try {
    // Get all trialing users
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("user_id, trial_start, trial_end, trial_extended_at, subscription_status, created_at")
      .in("subscription_status", ["trialing", "trial", "active"])
      .limit(1000);
    if (error) throw error;

    for (const sub of subs ?? []) {
      const trialStart = sub.trial_start ? new Date(sub.trial_start) : new Date(sub.created_at);
      const daysSince = Math.floor((Date.now() - trialStart.getTime()) / (1000 * 60 * 60 * 24));

      // Get user email
      const { data: userRes } = await supabase.auth.admin.getUserById(sub.user_id);
      const user = userRes?.user;
      if (!user?.email) continue;

      // Check activation progress for trial-extension trigger
      const { data: progress } = await supabase
        .from("onboarding_progress")
        .select("completion_score")
        .eq("user_id", sub.user_id)
        .maybeSingle();
      const score = progress?.completion_score ?? 0;

      // --- Trial extension: day 4-5, score < 30%, not yet extended
      if (daysSince >= 4 && daysSince <= 5 && score < 30 && !sub.trial_extended_at && sub.trial_end) {
        const oldEnd = new Date(sub.trial_end);
        const newEnd = new Date(oldEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
        await supabase
          .from("subscriptions")
          .update({
            trial_end: newEnd.toISOString(),
            trial_extended_at: new Date().toISOString(),
            trial_extension_days: 7,
          })
          .eq("user_id", sub.user_id);
        await sendDrip(supabase, sub.user_id, user.email, "trial-extended", {
          name: user.raw_user_meta_data?.full_name,
          extraDays: 7,
          newEndDate: newEnd.toISOString().slice(0, 10),
        });
        extended++;
      }

      // --- Day 7 trial reminder: send when 1-2 days remain
      if (sub.trial_end) {
        const daysLeft = Math.ceil((new Date(sub.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft >= 0 && daysLeft <= 2) {
          const ok = await sendDrip(supabase, sub.user_id, user.email, "drip-day7-trial-reminder", {
            name: user.raw_user_meta_data?.full_name,
            daysLeft,
          });
          if (ok) processed++;
        }
      }

      // --- Generic daily drips
      for (const rule of RULES) {
        if (daysSince >= rule.minDaysSinceSignup && daysSince <= rule.maxDaysSinceSignup) {
          const data = rule.buildData(sub, user);
          if (rule.template === "drip-day3-quickwins") (data as any).completedSteps = score / 14; // ~7 steps
          const ok = await sendDrip(supabase, sub.user_id, user.email, rule.template, data);
          if (ok) processed++;
          else failed++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, extended, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[process-drip-emails]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendDrip(
  supabase: any,
  userId: string,
  email: string,
  templateName: string,
  templateData: Record<string, any>
): Promise<boolean> {
  // Idempotency: skip if already logged
  const { data: existing } = await supabase
    .from("drip_email_log")
    .select("id")
    .eq("user_id", userId)
    .eq("template_name", templateName)
    .maybeSingle();
  if (existing) return false;

  const { error: invokeErr } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName,
      recipientEmail: email,
      idempotencyKey: `drip-${userId}-${templateName}`,
      templateData,
    },
  });

  if (invokeErr) {
    console.error("[drip] invoke failed", { templateName, userId, error: invokeErr });
    return false;
  }

  await supabase.from("drip_email_log").insert({
    user_id: userId,
    template_name: templateName,
    metadata: templateData,
  });
  return true;
}
