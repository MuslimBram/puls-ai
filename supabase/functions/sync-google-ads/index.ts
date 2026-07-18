// supabase/functions/sync-google-ads/index.ts
// ============================================================
// Sinkronizon të dhënat e Google Ads për CEO Dashboard.
// Ruan te google_ads_cache.
//
// KONFIGURIMI (Supabase Secrets):
//   GOOGLE_ADS_DEVELOPER_TOKEN
//   GOOGLE_ADS_CLIENT_ID
//   GOOGLE_ADS_CLIENT_SECRET
//   GOOGLE_ADS_REFRESH_TOKEN
//   GOOGLE_ADS_CUSTOMER_ID        (formati: "1234567890" pa vija)
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID  (opsional, për MCC)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s, headers: { ...CORS, "Content-Type": "application/json" },
  });

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN")!;

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
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function queryGoogleAds(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string | undefined,
  dateStart: string,
  dateStop: string,
): Promise<Record<string, unknown>> {
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
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
    { method: "POST", headers, body: JSON.stringify({ query: gaql }) },
  );
  if (!res.ok) throw new Error(`Google Ads API error: ${await res.text()}`);
  const data = await res.json() as { results?: Array<{ metrics: Record<string, unknown> }> };

  // Agrego të gjitha rreshtat
  let impressions = 0, clicks = 0, costMicros = 0, conversions = 0;
  for (const row of (data.results ?? [])) {
    const m = row.metrics;
    impressions += Number(m.impressions ?? 0);
    clicks += Number(m.clicks ?? 0);
    costMicros += Number(m.costMicros ?? m.cost_micros ?? 0);
    conversions += Number(m.conversions ?? 0);
  }
  const spend = costMicros / 1_000_000;
  return {
    impressions, clicks, spend, conversions,
    cpc: clicks > 0 ? spend / clicks : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cost_per_conv: conversions > 0 ? spend / conversions : 0,
    raw: data,
  };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
  const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");
  const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? undefined;

  if (!devToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    return json({
      error: "Google Ads secrets not configured",
      required: [
        "GOOGLE_ADS_DEVELOPER_TOKEN",
        "GOOGLE_ADS_CLIENT_ID",
        "GOOGLE_ADS_CLIENT_SECRET",
        "GOOGLE_ADS_REFRESH_TOKEN",
        "GOOGLE_ADS_CUSTOMER_ID",
      ],
      setup_guide:
        "Krijo OAuth client në Google Cloud Console → generate refresh token me scope 'https://www.googleapis.com/auth/adwords' → merr developer token nga Google Ads → API Center.",
    }, 503);
  }

  let body: { date_start?: string; date_stop?: string; workspace_id?: string } = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* */ } }

  const dateStop = body.date_stop ?? new Date().toISOString().split("T")[0];
  const dateStart = body.date_start ?? (() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  })();

  try {
    const accessToken = await getAccessToken();
    const metrics = await queryGoogleAds(
      customerId, accessToken, devToken, loginCustomerId, dateStart, dateStop,
    );

    const { error: cacheErr } = await supabase
      .from("google_ads_cache")
      .upsert({
        workspace_id: body.workspace_id ?? user.id,
        customer_id: customerId,
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
      }, { onConflict: "workspace_id,customer_id,date_start,date_stop" });

    if (cacheErr) throw cacheErr;

    return json({
      success: true,
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
