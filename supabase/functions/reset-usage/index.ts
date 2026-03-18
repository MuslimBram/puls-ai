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

    return new Response(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[RESET-USAGE] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
