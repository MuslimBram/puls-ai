import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  const unauth = requireCronAuth(req);
  if (unauth) return new Response(unauth.body, { status: unauth.status, headers: { ...getCors(req), "Content-Type": "application/json" } });



  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const { error: monthlyError } = await supabase.rpc("reset_monthly_usage");
    if (monthlyError) console.error("[RESET-USAGE] Monthly reset error:", monthlyError);
    else console.log("[RESET-USAGE] Monthly leads usage reset complete");

    const { error: dailyAiError } = await supabase.rpc("reset_daily_ai_replies");
    if (dailyAiError) console.error("[RESET-USAGE] Daily AI reset error:", dailyAiError);
    else console.log("[RESET-USAGE] Daily AI replies reset complete");

    const { data: mediaDailyResetCount, error: mediaDailyResetError } = await supabase.rpc("reset_expired_media_daily_usage");
    if (mediaDailyResetError) console.error("[RESET-USAGE] Media daily reset error:", mediaDailyResetError);
    else console.log(`[RESET-USAGE] Media daily credits reset for ${mediaDailyResetCount ?? 0} users`);

    const { error: monthlyMediaError } = await supabase
      .from("subscriptions")
      .update({
        images_generated_this_month: 0,
        videos_generated_this_month: 0,
        media_reset_at: new Date().toISOString(),
      })
      .lte("media_reset_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (monthlyMediaError) console.error("[RESET-USAGE] Media monthly reset error:", monthlyMediaError);
    else console.log("[RESET-USAGE] Monthly media counters reset complete");

    // Auto-delete unpaid accounts after 30 days
    const { data: cleanupResult, error: cleanupError } = await supabase.rpc("cleanup_expired_unpaid_accounts");
    if (cleanupError) console.error("[RESET-USAGE] Account cleanup error:", cleanupError);
    else console.log("[RESET-USAGE] Account cleanup:", cleanupResult);

    return new Response(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[RESET-USAGE] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
