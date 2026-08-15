// supabase/functions/google-ads-sync/index.ts
// ============================================================
// @deprecated Use sync-google-ads/index.ts as canonical function.
// ============================================================
// Sinkronizon të dhënat nga Google Ads API
// Konfigurimi (Supabase Secrets):
//   GOOGLE_ADS_DEVELOPER_TOKEN  — nga Google Ads API Center
//   GOOGLE_ADS_CUSTOMER_ID      — p.sh. "123-456-7890"
//   GOOGLE_ADS_REFRESH_TOKEN    — OAuth2 refresh token
//   GOOGLE_ADS_CLIENT_ID        — OAuth2 client ID
//   GOOGLE_ADS_CLIENT_SECRET    — OAuth2 client secret
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Merr access token me refresh token
async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_ADS_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ?? "",
      refresh_token: Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`OAuth2 dështoi: ${data.error}`);
  return data.access_token;
}

// Merr metrics nga Google Ads API v17
async function fetchGoogleAdsMetrics(
  customerId: string,
  accessToken: string,
  dateStart: string,
  dateStop: string
): Promise<Array<Record<string, unknown>>> {
  const GAQL = `
    SELECT
      campaign.id, campaign.name, campaign.status,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${dateStart}' AND '${dateStop}'
      AND campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50`;

  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerId.replace(/-/g,"")}/googleAds:search`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
        "Content-Type": "application/json",
        "login-customer-id": customerId.replace(/-/g,""),
      },
      body: JSON.stringify({ query: GAQL }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Ads API: ${res.status} — ${err.substring(0,200)}`);
  }

  const data = await res.json() as { results?: Array<Record<string, unknown>> };
  return data.results ?? [];
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  const CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");
  if (!CUSTOMER_ID) {
    return json({
      error: "GOOGLE_ADS_CUSTOMER_ID mungon",
      setup: {
        step1: "Shko te: console.developers.google.com",
        step2: "Aktivizo Google Ads API",
        step3: "Krijo OAuth2 credentials (Web Application)",
        step4: "Apliko për Developer Token te ads.google.com/api",
        step5: "Vendos te Supabase Secrets: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN",
      }
    }, 503);
  }

  let body: { date_start?: string; date_stop?: string; workspace_id?: string } = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /**/ }
  }

  const dateStop = body.date_stop ?? new Date().toISOString().split("T")[0];
  const dateStart = body.date_start ?? (() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  })();

  try {
    const accessToken = await getAccessToken();
    const results = await fetchGoogleAdsMetrics(CUSTOMER_ID, accessToken, dateStart, dateStop);

    // Agrejo stats totale
    let totalImpressions = 0, totalClicks = 0, totalCostMicros = 0, totalConversions = 0;
    for (const r of results) {
      const m = r.metrics as Record<string, unknown> ?? {};
      totalImpressions += parseInt(String(m.impressions ?? 0));
      totalClicks += parseInt(String(m.clicks ?? 0));
      totalCostMicros += parseInt(String(m.cost_micros ?? 0));
      totalConversions += parseFloat(String(m.conversions ?? 0));
    }

    const totalSpendEur = totalCostMicros / 1_000_000;
    const cpc = totalClicks > 0 ? totalSpendEur / totalClicks : 0;
    const ctr = totalImpressions > 0 ? totalClicks / totalImpressions * 100 : 0;
    const cpa = totalConversions > 0 ? totalSpendEur / totalConversions : 0;

    // Ruaj te meta_ads_cache (përdor të njëjtën tabelë me google si provider)
    await supabase.from("meta_ads_cache").upsert({
      workspace_id: body.workspace_id ?? user.id,
      ad_account_id: `google_${CUSTOMER_ID}`,
      date_start: dateStart,
      date_stop: dateStop,
      impressions: totalImpressions,
      clicks: totalClicks,
      spend: totalSpendEur,
      cpc,
      ctr,
      leads_count: Math.round(totalConversions),
      cost_per_lead: cpa,
      raw_data: { provider: "google_ads", campaigns: results.length, results: results.slice(0, 5) },
      synced_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,ad_account_id,date_start,date_stop" });

    // Log
    await supabase.from("google_sync_log").insert({
      workspace_id: body.workspace_id ?? user.id,
      service: "ads",
      action: "sync_campaigns",
      status: "success",
      items_synced: results.length,
    }).catch(() => {});

    return json({
      success: true,
      period: { from: dateStart, to: dateStop },
      campaigns: results.length,
      metrics: {
        impressions: totalImpressions,
        clicks: totalClicks,
        spend_eur: Math.round(totalSpendEur * 100) / 100,
        conversions: Math.round(totalConversions),
        ctr: Math.round(ctr * 100) / 100,
        cpc_eur: Math.round(cpc * 100) / 100,
        cpa_eur: Math.round(cpa * 100) / 100,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("google_sync_log").insert({
      workspace_id: body.workspace_id ?? user.id,
      service: "ads",
      action: "sync_campaigns",
      status: "error",
      error: msg,
    }).catch(() => {});
    return json({ error: msg }, 500);
  }
});
