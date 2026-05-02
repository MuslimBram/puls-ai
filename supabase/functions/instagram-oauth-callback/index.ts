import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

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

    const { code, state, redirect_uri } = await req.json();
    if (!code || !state) throw new Error("code and state are required");

    // Verify state
    const { data: oauthState, error: stateErr } = await supabase
      .from("oauth_states")
      .select("*")
      .eq("state", state)
      .eq("user_id", user.id)
      .single();

    if (stateErr || !oauthState) throw new Error("Invalid or expired OAuth state");

    // Check expiry
    if (new Date(oauthState.expires_at) < new Date()) {
      await supabase.from("oauth_states").delete().eq("id", oauthState.id);
      throw new Error("OAuth state expired. Please try again.");
    }

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Meta app credentials not configured");

    const callbackUri = redirect_uri || oauthState.redirect_uri;

    // Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.instagram.com/oauth/access_token");
    const tokenBody = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: callbackUri,
      code,
    });

    const tokenRes = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error("[instagram-oauth-callback] Token exchange failed:", tokenData);
      throw new Error(tokenData.error?.message || tokenData.error_message || "Token exchange failed");
    }

    const shortLivedToken = tokenData.access_token;
    const igUserId = tokenData.user_id?.toString();

    // Exchange for long-lived token
    const longTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`;
    const longTokenRes = await fetch(longTokenUrl);
    const longTokenData = await longTokenRes.json();

    const accessToken = longTokenData.access_token || shortLivedToken;
    const expiresIn = longTokenData.expires_in || 3600;

    // Get user profile
    const profileRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${accessToken}`
    );
    const profile = await profileRes.json();

    // Clean up oauth state
    await supabase.from("oauth_states").delete().eq("id", oauthState.id);

    // Get workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .single();

    // Determine capabilities based on account type
    const accountType = profile.account_type?.toLowerCase() || "business";
    const capabilities = ["auto_post", "manual_post", "analytics", "comments", "inbox", "scheduling", "publishing"];
    if (["business", "media_creator"].includes(accountType)) {
      capabilities.push("messaging");
    }

    // Upsert channel
    const channelData = {
      user_id: user.id,
      workspace_id: workspace?.id,
      channel_type: "instagram",
      channel_name: profile.username || profile.name || "Instagram",
      is_enabled: true,
      connection_status: "connected",
      connection_mode: "professional",
      account_type: accountType === "media_creator" ? "creator" : accountType === "personal_account" ? "personal" : "business",
      capabilities,
      settings: {
        access_token: accessToken,
        ig_user_id: igUserId || profile.user_id,
        username: profile.username,
        profile_picture_url: profile.profile_picture_url,
        account_type: profile.account_type,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      },
      provider_metadata: {
        connected_via: "oauth",
        username: profile.username,
        profile_picture_url: profile.profile_picture_url,
        account_type: profile.account_type,
      },
      reconnect_required: false,
    };

    // Check if channel exists for this user + type
    const { data: existing } = await supabase
      .from("channels")
      .select("id")
      .eq("user_id", user.id)
      .eq("channel_type", "instagram")
      .limit(1);

    let channelId: string;
    if (existing && existing.length > 0) {
      channelId = existing[0].id;
      await supabase.from("channels").update(channelData).eq("id", channelId);
    } else {
      const { data: inserted } = await supabase
        .from("channels")
        .insert(channelData as any)
        .select("id")
        .single();
      channelId = inserted?.id;
    }

    return new Response(JSON.stringify({
      ok: true,
      channel_id: channelId,
      username: profile.username,
      account_type: profile.account_type,
      profile_picture_url: profile.profile_picture_url,
    }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[instagram-oauth-callback]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
