import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, { error: "Unauthorized: Missing Bearer token" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json(req, { error: "Unauthorized" }, 401);

  let body: { workspace_id: string; redirect_uri?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }

  const { workspace_id } = body;
  if (!workspace_id) return json(req, { error: "workspace_id is required" }, 400);

  // Authorization check (no user.id fallback!)
  const { data: member } = await supabase.rpc("is_workspace_member", {
    _user_id: user.id,
    _workspace_id: workspace_id,
  });
  const { data: owned } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspace_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!member && !owned) {
    return json(req, { error: "Forbidden: Not authorized for this workspace" }, 403);
  }

  const clientId = Deno.env.get("CALCOM_CLIENT_ID");
  if (!clientId) {
    return json(req, { error: "CALCOM_CLIENT_ID non-configured" }, 500);
  }

  // Generate secure random state
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const state = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const redirectUri =
    body.redirect_uri ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/calcom-oauth-callback`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Store state in public.oauth_states
  const { error: stateErr } = await supabase.from("oauth_states").insert({
    user_id: user.id,
    workspace_id,
    provider: "calcom",
    state,
    redirect_uri: redirectUri,
    expires_at: expiresAt,
  });

  if (stateErr) {
    return json(req, { error: `Failed to persist OAuth state: ${stateErr.message}` }, 500);
  }

  const exactScopes = "EVENT_TYPE_READ BOOKING_READ WEBHOOK_WRITE";
  // OFFICIAL CAL.COM OAUTH2 AUTHORIZE URL
  const authUrl = `https://app.cal.com/auth/oauth2/authorize?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(
    state
  )}&scope=${encodeURIComponent(exactScopes)}`;

  return json(req, {
    success: true,
    auth_url: authUrl,
    state,
  });
});
