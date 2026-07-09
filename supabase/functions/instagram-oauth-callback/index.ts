// supabase/functions/instagram-oauth-callback/index.ts
// ============================================================
// SECURITY FIX: Token ruhet i shifruar (AES-GCM) jo plain-text
// Ndryshimi: rreshti 119 — settings: { access_token: accessToken }
//                           → access_token_encrypted: await encryptToken(accessToken)
//
// SHËNIM: Ky file është patch i plotë i funksionit.
// Kopjoje mbi instagram-oauth-callback/index.ts ekzistues.
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { encryptToken } from "../_shared/token-utils.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // workspace_id ose user_id
  const error = url.searchParams.get("error");

  const dashboardUrl = Deno.env.get("DASHBOARD_URL") ?? "https://kohablerjeve.top";

  if (error) {
    return Response.redirect(`${dashboardUrl}/connected-accounts?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return Response.redirect(`${dashboardUrl}/connected-accounts?error=no_code`);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    const appId     = Deno.env.get("INSTAGRAM_APP_ID")!;
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-oauth-callback`;

    // 1. Shkëmbe code → short-lived token
    const tokenUrl = new URL("https://api.instagram.com/oauth/access_token");
    const tokenBody = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(tokenUrl.toString(), {
      method: "POST",
      body: tokenBody,
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Token exchange dështoi: ${err}`);
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      user_id: string;
    };
    const shortLivedToken = tokenData.access_token;
    const igUserId = tokenData.user_id;

    // 2. Konverto në long-lived token (~60 ditë)
    const longTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`;
    const longTokenRes = await fetch(longTokenUrl);
    const longTokenData = await longTokenRes.json() as {
      access_token?: string;
      expires_in?: number;
    };
    const accessToken = longTokenData.access_token ?? shortLivedToken;
    const expiresIn = longTokenData.expires_in ?? 5184000; // 60 ditë default

    // 3. Merr profilin
    const profileRes = await fetch(
      `https://graph.instagram.com/v22.0/me?fields=id,username,name,profile_picture_url,account_type&access_token=${accessToken}`
    );
    const profile = await profileRes.json() as {
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      account_type?: string;
    };

    // ── NDRYSHIMI KRYESOR: ENCRYPT TOKEN ──────────────────────
    const encryptedToken = await encryptToken(accessToken);
    // Para: settings: { access_token: accessToken }  ← GABIM SIGURIE
    // Pas:  access_token_encrypted: encryptedToken   ← I SIGURT
    // ──────────────────────────────────────────────────────────

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 4. Ruaj te channels
    const { error: upsertErr } = await supabase
      .from("channels")
      .upsert({
        external_account_id: igUserId,
        platform: "instagram",
        handle_or_url: profile.username ?? igUserId,
        display_name: profile.name ?? profile.username,
        avatar_url: profile.profile_picture_url,
        account_type: profile.account_type,
        // Token i shifruar — jo plain-text
        access_token_encrypted: encryptedToken,
        token_expires_at: expiresAt,
        status: "active",
        connected_at: new Date().toISOString(),
        // Lidh me workspace/user nga state
        ...(state ? { workspace_id: state } : {}),
        settings: {
          ig_user_id: igUserId,
          username: profile.username,
          // NUK ruajmë access_token te settings — ASNJËHERË
        },
      }, { onConflict: "external_account_id,platform" });

    if (upsertErr) throw new Error(`Channel upsert dështoi: ${upsertErr.message}`);

    return Response.redirect(
      `${dashboardUrl}/connected-accounts?success=instagram&username=${encodeURIComponent(profile.username ?? "")}`
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("instagram-oauth-callback error:", msg);
    return Response.redirect(
      `${dashboardUrl}/connected-accounts?error=${encodeURIComponent(msg)}`
    );
  }
});
