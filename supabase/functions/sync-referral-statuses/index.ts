import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    getServiceKey() ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const { data, error } = await supabase.rpc("sync_referral_statuses");
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("webhook_activity_logs").insert({
      source: "referrals",
      event_type: "sync_error",
      status: "error",
      error_message: msg,
    }).catch(() => {});
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
