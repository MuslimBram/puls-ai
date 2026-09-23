import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...getCors(req), "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = await req.json() as Record<string, unknown>;
    const channelType = String(body.channel_type ?? "instagram").toLowerCase();
    const redirectUri = String(body.redirect_uri ?? "").trim();
    const workspaceId = String(body.workspace_id ?? "").trim();
    const businessId = String(body.business_id ?? "").trim(); // R111-C1: Accept business_id

    if (!redirectUri) return json(req, { error: "redirect_uri is required" }, 400);
    if (!workspaceId) return json(req, { error: "workspace_id is required" }, 400);
    if (!businessId) return json(req, { error: "business_id is required" }, 400); // R111-C1: Validate
    if (!['instagram', 'facebook'].includes(channelType)) {
      return json(req, { error: "Unsupported OAuth channel" }, 400);
    }

    const [{ data: member }, { data: owned }] = await Promise.all([
      supabase.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
      supabase.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) return json(req, { error: "Forbidden: not a workspace member" }, 403);

    const state = crypto.randomUUID();
    const { error: stateError } = await supabase.from("oauth_states").insert({
      state,
      user_id: user.id,
      workspace_id: workspaceId,
      channel_type: channelType,
      redirect_uri: redirectUri,
      business_id: businessId, // R111-C1: Store business_id
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) throw stateError;

    let oauthUrl: URL;
    if (channelType === "facebook") {
      const appId = Deno.env.get("META_APP_ID");
      if (!appId) return json(req, { error: "META_APP_ID not configured" }, 503);

      const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v23.0";
      oauthUrl = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
      oauthUrl.searchParams.set("client_id", appId);
      oauthUrl.searchParams.set("redirect_uri", redirectUri);
      oauthUrl.searchParams.set("response_type", "code");
      oauthUrl.searchParams.set("state", state);
      oauthUrl.searchParams.set("scope", [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_metadata",
        "pages_messaging",
        "read_insights",
        "instagram_basic",
        "instagram_manage_comments",
        "instagram_manage_messages",
      ].join(","));
    } else {
      const appId = Deno.env.get("INSTAGRAM_APP_ID") || Deno.env.get("META_APP_ID");
      if (!appId) return json(req, { error: "INSTAGRAM_APP_ID not configured" }, 503);

      oauthUrl = new URL("https://www.instagram.com/oauth/authorize");
      oauthUrl.searchParams.set("client_id", appId);
      oauthUrl.searchParams.set("redirect_uri", redirectUri);
      oauthUrl.searchParams.set("response_type", "code");
      oauthUrl.searchParams.set("state", state);
      oauthUrl.searchParams.set("scope", [
        "business_basic",
        "business_manage_comments",
        "business_content_publish",
        "instagram_business_manage_insights",
      ].join(","));
    }

    return json(req, { url: oauthUrl.toString(), state, channel_type: channelType });
  } catch (error) {
    console.error("[social-oauth-start]", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
