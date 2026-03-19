import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Generates a Twilio Access Token with Voice Grant for browser-based WebRTC calling.
 * Uses the business's own Twilio credentials stored in the channels table.
 *
 * Required channel settings:
 *   - account_sid
 *   - api_key_sid (Twilio API Key SID, NOT the main auth token)
 *   - api_key_secret (Twilio API Key Secret)
 *   - twiml_app_sid (TwiML Application SID for voice)
 *   - phone_number (caller ID)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { workspace_id } = body;

    if (!workspace_id) throw new Error("workspace_id required");

    // Get business Twilio credentials
    const { data: voipChannel } = await supabase
      .from("channels")
      .select("settings")
      .eq("workspace_id", workspace_id)
      .eq("channel_type", "voip")
      .eq("is_enabled", true)
      .single();

    if (!voipChannel?.settings) {
      throw new Error("No telephony provider configured");
    }

    const settings = voipChannel.settings as Record<string, string>;
    const accountSid = settings.account_sid;
    const apiKeySid = settings.api_key_sid;
    const apiKeySecret = settings.api_key_secret;
    const twimlAppSid = settings.twiml_app_sid;

    if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
      throw new Error(
        "Incomplete Twilio WebRTC credentials. Required: account_sid, api_key_sid, api_key_secret, twiml_app_sid. " +
        "Please update your telephony provider settings."
      );
    }

    // Generate JWT Access Token manually (Twilio Access Token spec)
    // Header: {"typ":"JWT","alg":"HS256","cty":"twilio-fpa;v=1"}
    // Payload includes Voice grant
    const now = Math.floor(Date.now() / 1000);
    const ttl = 3600; // 1 hour

    const header = {
      typ: "JWT",
      alg: "HS256",
      cty: "twilio-fpa;v=1",
    };

    const payload = {
      jti: `${apiKeySid}-${now}`,
      iss: apiKeySid,
      sub: accountSid,
      exp: now + ttl,
      nbf: now,
      grants: {
        identity: user.id,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: twimlAppSid },
        },
      },
    };

    // Base64URL encode
    const b64url = (obj: unknown) => {
      const json = JSON.stringify(obj);
      const b64 = btoa(json);
      return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };

    const headerEncoded = b64url(header);
    const payloadEncoded = b64url(payload);
    const signingInput = `${headerEncoded}.${payloadEncoded}`;

    // HMAC-SHA256 sign
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(apiKeySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const token = `${signingInput}.${sigB64}`;

    return new Response(JSON.stringify({
      token,
      identity: user.id,
      ttl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("twilio-token error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
