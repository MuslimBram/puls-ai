import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const getCors = (req: Request) => buildCorsHeaders(req);
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCors(req),
      "Content-Type": "application/json",
      "X-Pulse-AI-Deprecated-Endpoint": "google-ads-sync",
    },
  });

// Deprecated compatibility endpoint.
// All Google Ads authorization, tenant resolution, credential lookup and writes
// are performed by the canonical sync-google-ads function. This wrapper never
// reads global customer/refresh-token secrets and never performs service-role DML.
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") {
    return json(req, {
      error: "POST required",
      code: "LEGACY_GOOGLE_ADS_ENDPOINT",
      canonical_endpoint: "sync-google-ads",
    }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl) return json(req, { error: "Service unavailable" }, 503);

  const rawBody = await req.text();
  if (!rawBody) return json(req, { error: "JSON body with workspace_id is required" }, 400);

  const canonical = await fetch(`${supabaseUrl}/functions/v1/sync-google-ads`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: rawBody,
    signal: AbortSignal.timeout(60_000),
  });

  const responseBody = await canonical.text();
  return new Response(responseBody, {
    status: canonical.status,
    headers: {
      ...getCors(req),
      "Content-Type": canonical.headers.get("Content-Type") ?? "application/json",
      "X-Pulse-AI-Deprecated-Endpoint": "google-ads-sync",
      "X-Pulse-AI-Canonical-Endpoint": "sync-google-ads",
    },
  });
});
