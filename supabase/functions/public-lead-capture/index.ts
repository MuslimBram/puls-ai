import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
import { analyzePublicLead, type PublicLeadCaptureBody } from "./lead-analysis.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const rateLimitMap = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const maxRequests = 10;
  const times = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < window);
  times.push(now);
  rateLimitMap.set(ip, times);
  return times.length > maxRequests;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    return json({ error: "Shumë kërkesa. Provo pas 1 minute." }, 429);
  }

  let body: PublicLeadCaptureBody;

  try {
    body = await req.json();
  } catch {
    return json({ error: "Body i pavlefshëm" }, 400);
  }

  if (body.honeypot) {
    return json({ success: true });
  }

  if (!body.name?.trim() || !body.email?.trim()) {
    return json({ error: "Emri dhe emaili janë të detyrueshëm" }, 422);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return json({ error: "Email i pavlefshëm" }, 422);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  try {
    const analysis = await analyzePublicLead(body, {
      askAI,
      resolveTrustedWorkspaceId: () => null,
    });

    const { data: lead, error: leadErr } = await supabase
      .from("enterprise_leads")
      .insert({
        name: body.name.trim(),
        email: body.email.toLowerCase().trim(),
        phone: body.phone?.trim() ?? null,
        company_name: body.business_name?.trim() ?? null,
        message: body.message?.trim() ?? null,
        team_size: body.team_size ?? null,
        status: "new",
        source: body.source ?? "website",
        metadata: {
          interested_plan: body.interested_plan ?? null,
          utm_source: body.utm_source ?? null,
          utm_medium: body.utm_medium ?? null,
          utm_campaign: body.utm_campaign ?? null,
          ai_score: analysis.score,
          ai_intent: analysis.intent,
          ai_notes: analysis.notes,
        },
      })
      .select("id")
      .single();

    if (leadErr) {
      console.error("Lead insert error:", leadErr.message);
      return json({ error: leadErr.message }, 500);
    }

    return json({
      success: true,
      message: "Kërkesa u regjistrua. Do t'ju kontaktojmë brenda 24 orëve.",
      lead_id: lead?.id ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("public-lead-capture error:", msg);
    return json({ error: "Gabim i brendshëm. Provo sërish." }, 500);
  }
});
