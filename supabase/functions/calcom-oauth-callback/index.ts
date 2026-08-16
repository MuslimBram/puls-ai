import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { encryptForStorage } from "../_shared/token-utils.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const urlParams = new URL(req.url).searchParams;
  let code = urlParams.get("code");
  let state = urlParams.get("state");

  if (!code || !state) {
    try {
      const body = await req.json();
      code = code ?? body.code;
      state = state ?? body.state;
    } catch {
      /* ignore empty body */
    }
  }

  if (!code || !state) {
    return json(req, { error: "Missing required parameters: code and state" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // 1. ONE-TIME STATE CONSUMPTION AND VALIDATION
  const { data: storedState, error: stateQueryErr } = await supabase
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .eq("provider", "calcom")
    .maybeSingle();

  if (stateQueryErr || !storedState) {
    return json(req, { error: "Invalid or expired OAuth state parameter" }, 400);
  }

  // Delete consumed state immediately (one-time state)
  await supabase.from("oauth_states").delete().eq("id", storedState.id);

  if (new Date(storedState.expires_at) < new Date()) {
    return json(req, { error: "OAuth state parameter has expired" }, 400);
  }

  const workspaceId = storedState.workspace_id;
  const clientId = Deno.env.get("CALCOM_CLIENT_ID");
  const clientSecret = Deno.env.get("CALCOM_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return json(req, { error: "CALCOM_CLIENT_ID or CALCOM_CLIENT_SECRET non-configured" }, 500);
  }

  // 2. SERVER-SIDE CODE EXCHANGE VIA OFFICIAL CAL.COM API v2 OAUTH2 ENDPOINT
  let tokenData: { access_token: string; refresh_token?: string; expires_in?: number };
  try {
    const exchangeRes = await fetch("https://api.cal.com/v2/auth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: storedState.redirect_uri,
      }),
    });

    if (!exchangeRes.ok) {
      const errText = await exchangeRes.text();
      return json(req, { error: `Cal.com OAuth token exchange failed: ${errText}` }, exchangeRes.status);
    }
    tokenData = await exchangeRes.json();
  } catch (err) {
    return json(req, { error: `OAuth network error: ${err instanceof Error ? err.message : "Unknown"}` }, 500);
  }

  // 3. ENCRYPT & PERSIST WORKSPACE CONNECTION
  const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in ?? 3600);
  const credsPayload = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
  };

  const encryptedCreds = await encryptForStorage(JSON.stringify(credsPayload));

  const { data: existingChannel } = await supabase
    .from("channels")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("channel_type", "calcom")
    .maybeSingle();

  if (existingChannel) {
    await supabase
      .from("channels")
      .update({
        credentials_encrypted: encryptedCreds,
        connection_status: "connected",
        provider_metadata: { expires_at: expiresAt },
      })
      .eq("id", existingChannel.id);
  } else {
    await supabase.from("channels").insert({
      workspace_id: workspaceId,
      channel_type: "calcom",
      credentials_encrypted: encryptedCreds,
      connection_status: "connected",
      provider_metadata: { expires_at: expiresAt },
    });
  }

  return json(req, {
    success: true,
    workspace_id: workspaceId,
    connection_status: "connected",
    expires_at: expiresAt,
  });
});
