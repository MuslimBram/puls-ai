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

const ALLOWED_SOURCES = new Set([
  "website",
  "homepage",
  "pricing",
  "contact",
  "white_label",
  "live_demo",
]);

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

function cleanOptional(value: string | undefined, maxLength: number): string | null {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function normalizeSource(value: string | undefined): string {
  const source = value?.trim().toLowerCase() ?? "website";
  return ALLOWED_SOURCES.has(source) ? source : "website";
}

function normalizeIdempotencyKey(value: string | undefined): string | null {
  const key = value?.trim();
  if (!key || key.length > 100) return null;
  return /^[a-zA-Z0-9._:-]+$/.test(key) ? key : null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
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

  const name = body.name?.trim().slice(0, 160);
  const email = body.email?.trim().toLowerCase().slice(0, 320);
  const source = normalizeSource(body.source);
  const idempotencyKey = normalizeIdempotencyKey(body.idempotency_key);

  if (!name || !email) {
    return json({ error: "Emri dhe emaili janë të detyrueshëm" }, 422);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return json({ error: "Email i pavlefshëm" }, 422);
  }

  if (source === "live_demo" && body.privacy_consent !== true) {
    return json({ error: "Privacy consent is required for live-demo lead capture." }, 422);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  try {
    if (idempotencyKey) {
      const { data: existingLead, error: existingErr } = await supabase
        .from("enterprise_leads")
        .select("id")
        .eq("email", email)
        .eq("source", source)
        .contains("metadata", { idempotency_key: idempotencyKey })
        .limit(1)
        .maybeSingle();

      if (existingErr) {
        console.error("Lead idempotency lookup error:", existingErr.message);
      } else if (existingLead?.id) {
        return json({ success: true, duplicate: true, lead_id: existingLead.id });
      }
    }

    // Public capture is intentionally workspace-neutral. A caller-provided
    // target_workspace_id is never trusted for AI or private workspace access.
    const analysis = await analyzePublicLead(body, {
      askAI,
      resolveTrustedWorkspaceId: () => null,
    });

    const { data: lead, error: leadErr } = await supabase
      .from("enterprise_leads")
      .insert({
        name,
        email,
        phone: cleanOptional(body.phone, 80),
        company_name: cleanOptional(body.business_name, 200),
        message: cleanOptional(body.message, 4_000),
        team_size: cleanOptional(body.team_size, 80),
        status: "new",
        source,
        metadata: {
          interested_plan: cleanOptional(body.interested_plan, 120),
          utm_source: cleanOptional(body.utm_source, 200),
          utm_medium: cleanOptional(body.utm_medium, 200),
          utm_campaign: cleanOptional(body.utm_campaign, 200),
          page_url: cleanOptional(body.page_url, 1_000),
          capture_surface: source === "live_demo" ? "public_ai_live_demo" : "public_form",
          privacy_consent: source === "live_demo" ? true : null,
          idempotency_key: idempotencyKey,
          ai_score: analysis.score,
          ai_intent: analysis.intent,
          ai_notes: analysis.notes,
          ai_used: analysis.usedAI,
          routed_workspace_id: analysis.routedWorkspaceId,
        },
      })
      .select("id")
      .single();

    if (leadErr) {
      console.error("Lead insert error:", leadErr.message);
      return json({ error: "Lead could not be saved." }, 500);
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
