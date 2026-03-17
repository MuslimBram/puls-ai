import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

/**
 * Send SMS via Twilio Connector Gateway
 * 
 * Body: { to: string, body: string, from?: string, user_id: string }
 * 
 * Uses the Twilio connector gateway for auth — requires LOVABLE_API_KEY and TWILIO_API_KEY.
 * Falls back to channel settings for the "from" number if not provided.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  if (!TWILIO_API_KEY) {
    return new Response(JSON.stringify({ error: "TWILIO_API_KEY not configured. Connect Twilio in your project settings." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { to, body: messageBody, from, user_id } = await req.json();

    if (!to || !messageBody) {
      return new Response(JSON.stringify({ error: "to and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine "from" number: explicit param or from channel settings
    let fromNumber = from;
    if (!fromNumber && user_id) {
      const { data: smsChannel } = await supabase
        .from("channels")
        .select("settings")
        .eq("user_id", user_id)
        .eq("channel_type", "sms")
        .eq("is_enabled", true)
        .limit(1)
        .maybeSingle();

      const settings = smsChannel?.settings as Record<string, any> | null;
      fromNumber = settings?.phone_number || settings?.twilio_phone;
    }

    if (!fromNumber) {
      return new Response(JSON.stringify({ error: "No 'from' number available. Configure SMS channel first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via Twilio Connector Gateway
    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: messageBody,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[SEND-SMS] Twilio error:", data);
      return new Response(
        JSON.stringify({ error: `Twilio API error [${response.status}]`, details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, sid: data.sid, status: data.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[SEND-SMS] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
