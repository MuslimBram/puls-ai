// supabase/functions/sync-meta-ads/index.ts
// ============================================================
// PULSE AI — MULTI-WORKSPACE HARDENED META ADS SYNC (PHASE A1.1)
//
// Synchronizes Meta Ads (Facebook + Instagram Ads) insights into meta_ads_cache.
// Non-Custodial: Reads authorized ad data only. Does NOT process ad payments.
// Strict Isolation: ZERO fallback to global ad-account environment variables.
// Workspace-scoped: Requires explicit workspace_id and validates user authorization.
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

const META_FIELDS = [
  "impressions",
  "clicks",
  "spend",
  "reach",
  "cpc",
  "cpm",
  "ctr",
  "actions",
].join(",");

export async function fetchMetaAds(
  adAccountId: string,
  accessToken: string,
  dateStart: string,
  dateStop: string
): Promise<Record<string, unknown>> {
  const cleanAccountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const url = new URL(`https://graph.facebook.com/v22.0/${cleanAccountId}/insights`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", META_FIELDS);
  url.searchParams.set("time_range", JSON.stringify({ since: dateStart, until: dateStop }));
  url.searchParams.set("level", "account");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = (await res.json()) as Record<string, unknown>;
    throw new Error(`Meta Ads API error: ${JSON.stringify(err)}`);
  }
  const data = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return data.data?.[0] ?? {};
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

  // 3. WORKSPACE-SCOPED CREDENTIAL RESOLUTION (Zero global account fallback!)
  const { data: channel } = await supabase
    .from("channels")
    .select("credentials_encrypted, provider_metadata")
    .eq("workspace_id", workspaceId)
    .in("channel_type", ["meta_ads", "meta"])
    .eq("connection_status", "connected")
    .maybeSingle();

  let metaToken: string | null = null;
  let adAccount: string | null = null;

  if (channel) {
    if (channel.credentials_encrypted) {
      try {
        metaToken = await decryptIfNeeded(channel.credentials_encrypted);
      } catch {
        /* invalid token */
      }
    }
    adAccount = channel.provider_metadata?.ad_account_id ?? channel.provider_metadata?.account_id ?? null;
  }

  // Strictly fail closed if workspace has no connected Meta Ads account credentials
  if (!metaToken || !adAccount) {
    return json(
      {
        error: "Meta Ads credentials not connected for this workspace",
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
    const rawData = await fetchMetaAds(adAccount, metaToken, dateStart, dateStop);

    const actions = (rawData.actions as Array<Record<string, unknown>>) ?? [];
    const leadsAction = actions.find((a) => a.action_type === "lead");
    const leadsCount = leadsAction ? parseInt(leadsAction.value as string) : 0;
    const spend = parseFloat((rawData.spend as string) ?? "0");
    const costPerLead = leadsCount > 0 ? spend / leadsCount : 0;

    // 4. CACHE WRITE WITH EXPLICIT WORKSPACE_ID
    const { error: cacheErr } = await supabase.from("meta_ads_cache").upsert(
      {
        workspace_id: workspaceId,
        ad_account_id: adAccount,
        date_start: dateStart,
        date_stop: dateStop,
        impressions: parseInt((rawData.impressions as string) ?? "0"),
        clicks: parseInt((rawData.clicks as string) ?? "0"),
        spend: spend,
        reach: parseInt((rawData.reach as string) ?? "0"),
        cpc: parseFloat((rawData.cpc as string) ?? "0"),
        cpm: parseFloat((rawData.cpm as string) ?? "0"),
        ctr: parseFloat((rawData.ctr as string) ?? "0"),
        leads_count: leadsCount,
        cost_per_lead: costPerLead,
        raw_data: rawData,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,ad_account_id,date_start,date_stop" }
    );

    if (cacheErr) throw cacheErr;

    return json({
      success: true,
      workspace_id: workspaceId,
      period: { from: dateStart, to: dateStop },
      metrics: {
        impressions: parseInt((rawData.impressions as string) ?? "0"),
        clicks: parseInt((rawData.clicks as string) ?? "0"),
        spend: spend,
        leads: leadsCount,
        cost_per_lead: Math.round(costPerLead * 100) / 100,
        ctr: parseFloat((rawData.ctr as string) ?? "0"),
        cpm: parseFloat((rawData.cpm as string) ?? "0"),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
