import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { channel_type, redirect_uri } = await req.json();
    if (!redirect_uri) throw new Error("redirect_uri is required");

    const appId = Deno.env.get("META_APP_ID");
    if (!appId) throw new Error("META_APP_ID not configured");

    // Generate random state and store it for verification
    const state = crypto.randomUUID();
    await supabase.from("oauth_states").insert({
      state,
      user_id: user.id,
      channel_type: channel_type || "instagram",
      redirect_uri,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    });

    // Build Instagram Business Login OAuth URL
    const scopes = [
      "business_basic",
      "business_manage_comments",
      "business_content_publish",
      "instagram_business_manage_insights",
    ].join(",");

    const oauthUrl = new URL("https://www.instagram.com/oauth/authorize");
    oauthUrl.searchParams.set("client_id", appId);
    oauthUrl.searchParams.set("redirect_uri", redirect_uri);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("scope", scopes);
    oauthUrl.searchParams.set("state", state);

    return new Response(JSON.stringify({ url: oauthUrl.toString(), state }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[instagram-oauth-start]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
