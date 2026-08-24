import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { encryptForStorage } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...getCors(req), "Content-Type": "application/json" },
});

type OAuthStateRow = {
  state: string;
  user_id: string;
  workspace_id: string | null;
  channel_type: string;
  redirect_uri: string;
  expires_at: string;
};

async function upsertSocialChannel(
  sb: ReturnType<typeof createClient>,
  input: {
    userId: string;
    workspaceId: string;
    channelType: "facebook" | "instagram";
    channelName: string;
    settings: Record<string, unknown>;
    credentials: Record<string, string>;
    providerMetadata: Record<string, unknown>;
  },
) {
  const { data: existing, error: findError } = await sb
    .from("channels")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("channel_type", input.channelType)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  const common = {
    user_id: input.userId,
    workspace_id: input.workspaceId,
    channel_type: input.channelType,
    channel_name: input.channelName,
    connection_mode: "professional",
    account_type: "business",
    is_enabled: true,
    connection_status: "connected",
    last_error: null,
    settings: input.settings,
    credentials_encrypted: input.credentials,
    provider_metadata: input.providerMetadata,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await sb.from("channels").update(common).eq("id", existing.id).eq("workspace_id", input.workspaceId);
    if (error) throw error;
    return existing.id as string;
  }

  const { data: created, error } = await sb.from("channels").insert(common).select("id").single();
  if (error || !created) throw error || new Error("Failed to create channel");
  return created.id as string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await sb.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = await req.json() as Record<string, unknown>;
    const code = String(body.code ?? "").trim();
    const state = String(body.state ?? "").trim();
    const redirectUri = String(body.redirect_uri ?? "").trim();
    if (!code || !state || !redirectUri) return json(req, { error: "code, state and redirect_uri are required" }, 400);

    const { data: oauthState, error: stateError } = await sb
      .from("oauth_states")
      .select("state,user_id,workspace_id,channel_type,redirect_uri,expires_at")
      .eq("state", state)
      .eq("user_id", user.id)
      .maybeSingle();
    if (stateError) throw stateError;
    if (!oauthState) return json(req, { error: "Invalid OAuth state" }, 400);

    const stateRow = oauthState as OAuthStateRow;
    if (new Date(stateRow.expires_at).getTime() <= Date.now()) {
      await sb.from("oauth_states").delete().eq("state", state).eq("user_id", user.id);
      return json(req, { error: "OAuth state expired" }, 400);
    }
    if (stateRow.redirect_uri !== redirectUri) return json(req, { error: "OAuth redirect URI mismatch" }, 400);
    if (!stateRow.workspace_id) return json(req, { error: "OAuth state is not workspace-scoped; reconnect from Channels" }, 400);

    const workspaceId = stateRow.workspace_id;
    const [{ data: member }, { data: owned }] = await Promise.all([
      sb.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
      sb.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) return json(req, { error: "Forbidden: workspace access changed" }, 403);

    if (stateRow.channel_type === "facebook") {
      const appId = Deno.env.get("META_APP_ID");
      const appSecret = Deno.env.get("META_APP_SECRET");
      if (!appId || !appSecret) return json(req, { error: "Meta OAuth is not configured" }, 503);
      const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v23.0";

      const exchangeUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
      exchangeUrl.searchParams.set("client_id", appId);
      exchangeUrl.searchParams.set("client_secret", appSecret);
      exchangeUrl.searchParams.set("redirect_uri", redirectUri);
      exchangeUrl.searchParams.set("code", code);
      const exchangeRes = await fetch(exchangeUrl, { headers: { Accept: "application/json" } });
      const exchange = await exchangeRes.json() as Record<string, unknown>;
      if (!exchangeRes.ok || !exchange.access_token) {
        throw new Error(String((exchange as any)?.error?.message || "Facebook code exchange failed"));
      }

      const longUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
      longUrl.searchParams.set("grant_type", "fb_exchange_token");
      longUrl.searchParams.set("client_id", appId);
      longUrl.searchParams.set("client_secret", appSecret);
      longUrl.searchParams.set("fb_exchange_token", String(exchange.access_token));
      const longRes = await fetch(longUrl, { headers: { Accept: "application/json" } });
      const longData = await longRes.json() as Record<string, unknown>;
      const userAccessToken = String(longData.access_token || exchange.access_token);

      const pagesUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
      pagesUrl.searchParams.set("fields", "id,name,access_token,category,tasks,instagram_business_account{id,username,name,profile_picture_url}");
      const pagesRes = await fetch(pagesUrl, { headers: { Authorization: `Bearer ${userAccessToken}` } });
      const pagesData = await pagesRes.json() as { data?: Array<Record<string, any>>; error?: { message?: string } };
      if (!pagesRes.ok) throw new Error(pagesData.error?.message || "Unable to list Facebook Pages");
      const pages = pagesData.data ?? [];
      if (pages.length === 0) return json(req, { error: "No manageable Facebook Page was returned by Meta" }, 400);

      // Current product model stores one professional Facebook connection per workspace.
      // Use the first Page returned by Meta and report page_count so the UI can surface
      // an explicit selector in a later multi-page enhancement without storing user tokens.
      const page = pages[0];
      if (!page.id || !page.access_token) return json(req, { error: "Selected Facebook Page did not include an access token" }, 400);

      const pageAccessToken = await encryptForStorage(String(page.access_token));
      const instagramAccount = page.instagram_business_account ?? null;
      const channelId = await upsertSocialChannel(sb, {
        userId: user.id,
        workspaceId,
        channelType: "facebook",
        channelName: String(page.name || "Facebook"),
        settings: {
          page_id: String(page.id),
          instagram_account_id: instagramAccount?.id ? String(instagramAccount.id) : null,
        },
        credentials: { page_access_token: pageAccessToken },
        providerMetadata: {
          page_name: page.name ?? null,
          page_category: page.category ?? null,
          instagram_username: instagramAccount?.username ?? null,
          oauth_provider: "facebook",
        },
      });

      await sb.from("oauth_states").delete().eq("state", state).eq("user_id", user.id);
      return json(req, {
        ok: true,
        channel_type: "facebook",
        channel_id: channelId,
        display_name: page.name ?? "Facebook",
        username: page.name ?? "Facebook",
        page_id: page.id,
        page_count: pages.length,
        selection_strategy: pages.length > 1 ? "first_managed_page" : "single_page",
        instagram_account_id: instagramAccount?.id ?? null,
        profile_picture_url: instagramAccount?.profile_picture_url ?? null,
      });
    }

    if (stateRow.channel_type !== "instagram") return json(req, { error: "Unsupported OAuth channel" }, 400);

    const appId = Deno.env.get("INSTAGRAM_APP_ID") || Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET") || Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) return json(req, { error: "Instagram OAuth is not configured" }, 503);

    const tokenBody = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: tokenBody });
    const tokenData = await tokenRes.json() as { access_token?: string; user_id?: string; error_message?: string };
    if (!tokenRes.ok || !tokenData.access_token || !tokenData.user_id) {
      throw new Error(tokenData.error_message || "Instagram code exchange failed");
    }

    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("access_token", tokenData.access_token);
    const longRes = await fetch(longUrl);
    const longData = await longRes.json() as { access_token?: string; expires_in?: number };
    const accessToken = longData.access_token || tokenData.access_token;

    const profileUrl = new URL("https://graph.instagram.com/v22.0/me");
    profileUrl.searchParams.set("fields", "id,username,name,profile_picture_url,account_type");
    const profileRes = await fetch(profileUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const profile = await profileRes.json() as Record<string, any>;
    if (!profileRes.ok || !profile.id) throw new Error(profile.error?.message || "Unable to load Instagram profile");

    const channelId = await upsertSocialChannel(sb, {
      userId: user.id,
      workspaceId,
      channelType: "instagram",
      channelName: String(profile.name || profile.username || "Instagram"),
      settings: { instagram_account_id: String(profile.id) },
      credentials: { access_token: await encryptForStorage(accessToken) },
      providerMetadata: {
        username: profile.username ?? null,
        profile_picture_url: profile.profile_picture_url ?? null,
        account_type: profile.account_type ?? null,
        token_expires_at: longData.expires_in ? new Date(Date.now() + longData.expires_in * 1000).toISOString() : null,
        oauth_provider: "instagram",
      },
    });

    await sb.from("oauth_states").delete().eq("state", state).eq("user_id", user.id);
    return json(req, {
      ok: true,
      channel_type: "instagram",
      channel_id: channelId,
      username: profile.username ?? profile.name ?? "Instagram",
      display_name: profile.name ?? profile.username ?? "Instagram",
      profile_picture_url: profile.profile_picture_url ?? null,
    });
  } catch (error) {
    console.error("[social-oauth-callback]", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
