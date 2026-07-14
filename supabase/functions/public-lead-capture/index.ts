// supabase/functions/public-lead-capture/index.ts
// ============================================================
// Kap leads nga forma publike e website-it (pa auth)
// Thirret nga: faqja e landing, popup, buton "Kontakto"
// ✓ Pa autentifikim — vizitorë të website-it
// ✓ AI score automatik (Lovable → Anthropic fallback)
// ✓ Anti-spam: rate limit + honeypot field
// ✓ UTM tracking (source, medium, campaign)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*", // publik
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Rate limiting i thjeshtë (IP based)
const rateLimitMap = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 minutë
  const maxRequests = 3;
  const times = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < window);
  times.push(now);
  rateLimitMap.set(ip, times);
  return times.length > maxRequests;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Rate limiting
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    return json({ error: "Shumë kërkesa. Provo pas 1 minute." }, 429);
  }

  let body: {
    // Fushat kryesore
    name: string;
    email: string;
    phone?: string;
    business_name?: string;
    message?: string;
    // Paketa e interesit
    interested_plan?: string;
    team_size?: string;
    // Anti-spam
    honeypot?: string;
    // Tracking
    source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    page_url?: string;
    // Business target (nëse ka shumë biznese te platforma)
    target_workspace_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Body i pavlefshëm" }, 400);
  }

  // Anti-spam: honeypot field duhet të jetë bosh
  if (body.honeypot) {
    return json({ success: true }); // Pretendo sukses
  }

  // Validim bazik
  if (!body.name?.trim() || !body.email?.trim()) {
    return json({ error: "Emri dhe emaili janë të detyrueshëm" }, 422);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return json({ error: "Email i pavlefshëm" }, 422);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    // ── 1. AI Score automatik ─────────────────────────────
    let aiScore = 0.5;
    let aiIntent = "interested";
    let aiNotes = "";

    try {
      const aiPrompt = `Analize këtë lead dhe kthe VETËM JSON të vlefshëm:
Emri: ${body.name}
Email: ${body.email}
Biznesi: ${body.business_name ?? "i panjohur"}
Mesazhi: ${body.message ?? "nuk ka mesazh"}
Plani i interesuar: ${body.interested_plan ?? "i panjohur"}
Madhësia e ekipit: ${body.team_size ?? "i panjohur"}

Kthe: {"score": 0.0-1.0, "intent": "cold|warm|hot", "notes": "1 fjali"}`;

      const aiResult = await askAI(
        "Ti je analizues i leads. Kthen VETËM JSON të vlefshëm pa markdown.",
        aiPrompt,
        150
      );
      const parsed = JSON.parse(aiResult.replace(/```json|```/g, "").trim());
      aiScore = Math.min(1, Math.max(0, parsed.score ?? 0.5));
      aiIntent = parsed.intent ?? "warm";
      aiNotes = parsed.notes ?? "";
    } catch {
      // Nëse AI dështon, vazhdo pa score
      aiScore = body.message ? 0.6 : 0.4;
    }

    // ── 2. Ruaj lead-in ───────────────────────────────────
    const { data: lead, error: leadErr } = await supabase
      .from("public_leads")
      .insert({
        name: body.name.trim(),
        email: body.email.toLowerCase().trim(),
        phone: body.phone?.trim() ?? null,
        business_name: body.business_name?.trim() ?? null,
        message: body.message?.trim() ?? null,
        interested_plan: body.interested_plan ?? null,
        team_size: body.team_size ?? null,
        ai_score: aiScore,
        ai_intent: aiIntent,
        ai_notes: aiNotes,
        source: body.source ?? "website",
        utm_source: body.utm_source ?? null,
        utm_medium: body.utm_medium ?? null,
        utm_campaign: body.utm_campaign ?? null,
        page_url: body.page_url ?? null,
        target_workspace_id: body.target_workspace_id ?? null,
        ip_address: ip,
        status: "new",
      })
      .select("id")
      .single();

    if (leadErr) {
      console.error("Lead insert error:", leadErr.message);
      // Nëse tabela nuk ekziston, shto gjithsesi te enterprise_leads
      await supabase.from("enterprise_leads").insert({
        name: body.name.trim(),
        email: body.email.toLowerCase().trim(),
        phone: body.phone?.trim() ?? null,
        company_name: body.business_name?.trim() ?? null,
        message: body.message?.trim() ?? null,
        source: body.source ?? "website",
        metadata: {
          utm_source: body.utm_source,
          utm_campaign: body.utm_campaign,
          ai_score: aiScore,
          ai_intent: aiIntent,
        },
      }).catch(() => {});
    }

    // ── 3. Dërgo email konfirmimi (nëse ka send-email) ────
    if (body.email) {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            to: body.email,
            subject: "E morëm kërkesën tuaj — Pulse AI",
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
                <h2 style="color:#2563eb">Faleminderit, ${body.name.split(" ")[0]}!</h2>
                <p>E morëm kërkesën tuaj. Ekipi ynë do t'ju kontaktojë brenda <strong>24 orëve</strong>.</p>
                ${body.interested_plan ? `<p>Plani i interesuar: <strong>${body.interested_plan}</strong></p>` : ""}
                <p style="color:#6b7280;font-size:14px">Pulse AI — Business Operating System AI</p>
              </div>`,
          }),
        }
      ).catch(() => {}); // Jo kritike
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
