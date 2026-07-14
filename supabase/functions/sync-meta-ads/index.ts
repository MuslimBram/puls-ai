// supabase/functions/sync-meta-ads/index.ts
// ============================================================
// Sinkronizon të dhënat e Meta Ads (Facebook + Instagram Ads)
// Thirret: manualisht nga CEO Dashboard ose cron çdo ditë
// Ruan te meta_ads_cache për shpejtësi
//
// KONFIGURIMI i nevojshëm (te Supabase Secrets):
//   META_ADS_ACCESS_TOKEN  — nga Meta Business Suite
//   META_AD_ACCOUNT_ID     — "act_XXXXXXXXX"
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s, headers: { ...CORS, "Content-Type": "application/json" },
  });

const META_FIELDS = [
  "impressions", "clicks", "spend", "reach",
  "cpc", "cpm", "ctr", "actions",
].join(",");

async function fetchMetaAds(
  adAccountId: string,
  accessToken: string,
  dateStart: string,
  dateStop: string
): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/v22.0/${adAccountId}/insights`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", META_FIELDS);
  url.searchParams.set("time_range", JSON.stringify({ since: dateStart, until: dateStop }));
  url.searchParams.set("level", "account");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json() as Record<string, unknown>;
    throw new Error(`Meta Ads API error: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as { data?: Array<Record<string, unknown>> };
  return data.data?.[0] ?? {};
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

  const META_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN");
  const AD_ACCOUNT = Deno.env.get("META_AD_ACCOUNT_ID");

  if (!META_TOKEN || !AD_ACCOUNT) {
    return json({
      error: "Mungojnë secrets: META_ADS_ACCESS_TOKEN dhe META_AD_ACCOUNT_ID",
      setup_guide: "Shto te Supabase Secrets nga Meta Business Suite → System Users → Generate Token",
      required_permissions: ["ads_read", "ads_management", "business_management"],
    }, 503);
  }

  // Parametrat
  let body: { date_start?: string; date_stop?: string; workspace_id?: string } = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /* */ }
  }

  const dateStop = body.date_stop ?? new Date().toISOString().split("T")[0];
  const dateStart = body.date_start ?? (() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  })();

  try {
    const rawData = await fetchMetaAds(AD_ACCOUNT, META_TOKEN, dateStart, dateStop);

    // Nxjerr leads nga actions
    const actions = (rawData.actions as Array<Record<string, unknown>>) ?? [];
    const leadsAction = actions.find((a) => a.action_type === "lead");
    const leadsCount = leadsAction ? parseInt(leadsAction.value as string) : 0;
    const spend = parseFloat(rawData.spend as string ?? "0");
    const costPerLead = leadsCount > 0 ? spend / leadsCount : 0;

    // Ruaj te cache
    const { error: cacheErr } = await supabase
      .from("meta_ads_cache")
      .upsert({
        workspace_id: body.workspace_id ?? user.id,
        ad_account_id: AD_ACCOUNT,
        date_start: dateStart,
        date_stop: dateStop,
        impressions: parseInt(rawData.impressions as string ?? "0"),
        clicks: parseInt(rawData.clicks as string ?? "0"),
        spend: spend,
        reach: parseInt(rawData.reach as string ?? "0"),
        cpc: parseFloat(rawData.cpc as string ?? "0"),
        cpm: parseFloat(rawData.cpm as string ?? "0"),
        ctr: parseFloat(rawData.ctr as string ?? "0"),
        leads_count: leadsCount,
        cost_per_lead: costPerLead,
        raw_data: rawData,
        synced_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,ad_account_id,date_start,date_stop" });

    if (cacheErr) throw cacheErr;

    return json({
      success: true,
      period: { from: dateStart, to: dateStop },
      metrics: {
        impressions: parseInt(rawData.impressions as string ?? "0"),
        clicks: parseInt(rawData.clicks as string ?? "0"),
        spend: spend,
        leads: leadsCount,
        cost_per_lead: Math.round(costPerLead * 100) / 100,
        ctr: parseFloat(rawData.ctr as string ?? "0"),
        cpm: parseFloat(rawData.cpm as string ?? "0"),
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
