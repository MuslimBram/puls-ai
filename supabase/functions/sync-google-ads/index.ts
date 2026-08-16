// supabase/functions/sync-google-ads/index.ts
// ============================================================
// PULSE AI — MULTI-WORKSPACE HARDENED GOOGLE ADS SYNC (PHASE A1.1)
//
// Synchronizes Google Ads insights into google_ads_cache.
// Non-Custodial: Reads authorized ad data only. Does NOT process ad payments.
// Strict Isolation: ZERO fallback to global customer/refresh_token environment variables.
// Workspace-scoped: Requires explicit workspace_id and validates user authorization.
// Application Secrets: GOOGLE_ADS_DEVELOPER_TOKEN, CLIENT_ID, CLIENT_SECRET remain server secrets.
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

export async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function queryGoogleAds(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string | undefined,
  dateStart: string,
  dateStop: string
): Promise<Record<string, unknown>> {
  const cleanCustomerId = customerId.replace(/-/g, "");
  const gaql = `
    SELECT
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.average_cpc,
      metrics.ctr
    FROM customer
    WHERE segments.date BETWEEN '${dateStart}' AND '${dateStop}'
  `;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${cleanCustomerId}/googleAds:search`,
    { method: "POST", headers, body: JSON.stringify({ query: gaql }) }
  );
  if (!res.ok) throw new Error(`Google Ads API error: ${await res.text()}`);
  const data = (await res.json()) as { results?: Array<{ metrics: Record<string, unknown> }> };

  let impressions = 0,
    clicks = 0,
    costMicros = 0,
    conversions = 0;
  for (const row of data.results ?? []) {
    const m = row.metrics;
    impressions += Number(m.impressions ?? 0);
    clicks += Number(m.clicks ?? 0);
    costMicros += Number(m.costMicros ?? m.cost_micros ?? 0);
    conversions += Number(m.conversions ?? 0);
  }
  const spend = costMicros / 1_000_000;
  return {
    impressions,
    clicks,
    spend,
    conversions,
    cpc: clicks > 0 ? spend / clicks : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cost_per_conv: conversions > 0 ? spend / conversions : 0,
    raw: data,
  };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized: Missing Bearer token" }, 401);
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
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  // Parse payload
  let body: { date_start?: string; date_stop?: string; workspace_id?: string } = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      /* empty */
    }
  }

  // 1. HARDENED WORKSPACE VALIDATION (No user.id fallback!)
  const workspaceId = body.workspace_id;
  if (!workspaceId || typeof workspaceId !== "string" || workspaceId.trim() === "") {
    return json({ error: "workspace_id is required" }, 400);
  }

  // 2. HARDENED AUTHORIZATION CHECK (Before any external HTTP request or DB write)
  const { data: member } = await supabase.rpc("is_workspace_member", {
    _user_id: user.id,
    _workspace_id: workspaceId,
  }).maybeSingle();

  const { data: owned } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!member && !owned) {
    return json({ error: "Forbidden: Not authorized for this workspace" }, 403);
  }

  // 3. APPLICATION-LEVEL GLOBAL SECRETS (Required per Deno environment)
  const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET");
  const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? undefined;

  // 4. WORKSPACE-SCOPED ACCOUNT CREDENTIAL RESOLUTION (Zero global customer fallback!)
  let activeRefreshToken: string | null = null;
  let activeCustomerId: string | null = null;

  const { data: channel } = await supabase
    .from("channels")
    .select("credentials_encrypted, provider_metadata")
    .eq("workspace_id", workspaceId)
    .in("channel_type", ["google_ads", "google"])
    .eq("connection_status", "connected")
    .maybeSingle();

  if (channel) {
    if (channel.credentials_encrypted) {
      try {
        activeRefreshToken = await decryptIfNeeded(channel.credentials_encrypted);
      } catch {
        /* invalid token */
      }
    }
    activeCustomerId = channel.provider_metadata?.customer_id ?? channel.provider_metadata?.account_id ?? null;
  }

  // Strictly fail closed if workspace has no connected Google Ads account credentials
  if (!devToken || !clientId || !clientSecret || !activeRefreshToken || !activeCustomerId) {
    return json(
      {
        error: "Google Ads credentials not connected for this workspace",
        code: "MISSING_WORKSPACE_CREDENTIALS",
      },
      400
    );
  }

  const dateStop = body.date_stop ?? new Date().toISOString().split("T")[0];
  const dateStart =
    body.date_start ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split("T")[0];
    })();

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, activeRefreshToken);
    const metrics = await queryGoogleAds(
      activeCustomerId,
      accessToken,
      devToken,
      loginCustomerId,
      dateStart,
      dateStop
    );

    // 5. CACHE WRITE WITH EXPLICIT WORKSPACE_ID
    const { error: cacheErr } = await supabase.from("google_ads_cache").upsert(
      {
        workspace_id: workspaceId,
        customer_id: activeCustomerId,
        date_start: dateStart,
        date_stop: dateStop,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        spend: metrics.spend,
        conversions: metrics.conversions,
        cpc: metrics.cpc,
        ctr: metrics.ctr,
        cost_per_conv: metrics.cost_per_conv,
        raw_data: metrics.raw,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,customer_id,date_start,date_stop" }
    );

    if (cacheErr) throw cacheErr;

    return json({
      success: true,
      workspace_id: workspaceId,
      period: { from: dateStart, to: dateStop },
      metrics: {
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        spend: metrics.spend,
        conversions: metrics.conversions,
        cpc: Math.round((metrics.cpc as number) * 100) / 100,
        ctr: Math.round((metrics.ctr as number) * 100) / 100,
        cost_per_conversion: Math.round((metrics.cost_per_conv as number) * 100) / 100,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
