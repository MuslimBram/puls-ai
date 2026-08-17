import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
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

  let body: {
    name: string;
    email: string;
    phone?: string;
    business_name?: string;
    message?: string;
    interested_plan?: string;
    team_size?: string;
    honeypot?: string;
    source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    page_url?: string;
    target_workspace_id?: string;
  };

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
    let aiScore = 0.5;
    let aiIntent = "interested";
    let aiNotes = "";

    try {
      const aiPrompt = `Analizo këtë lead dhe kthe VETËM JSON të vlefshëm:
Emri: ${body.name}
Email: ${body.email}
Biznesi: ${body.business_name ?? "i panjohur"}
Mesazhi: ${body.message ?? "nuk ka mesazh"}
Plani: ${body.interested_plan ?? "i panjohur"}

Kthe: {"score": 0.0-1.0, "intent": "cold|warm|hot", "notes": "1 fjali"}`;

      const aiResult = await askAI(
        "Ti je analizues i leads. Kthen VETËM JSON të vlefshëm pa markdown.",
        aiPrompt,
        150
      );
      const parsed = JSON.parse(aiResult.replace(/```json|```/g, "").trim());
      aiScore = Math.min(1, Math.max(0, Number(parsed.score ?? 0.5)));
      aiIntent = parsed.intent ?? "warm";
      aiNotes = parsed.notes ?? "";
    } catch {
      aiScore = body.message ? 0.6 : 0.4;
    }

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
          ai_score: aiScore,
          ai_intent: aiIntent,
          ai_notes: aiNotes,
        },
      })
      .select("id")
      .single();

    if (leadErr) {
      console.error("Lead insert error:", leadErr.message);
      return json({ error: leadErr.message }, 500);
    }

    // Auto-enroll in default or lead_created active sequence if target_workspace_id is provided
    let enrollmentId: string | null = null;
    const targetWorkspaceId = body.target_workspace_id?.trim();

    if (targetWorkspaceId) {
      try {
        const { data: defaultSeq, error: seqFetchErr } = await supabase
          .from("sales_sequences")
          .select("id, workspace_id")
          .eq("workspace_id", targetWorkspaceId)
          .eq("status", "active")
          .or("is_default.eq.true,trigger_type.eq.lead_created")
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (seqFetchErr) {
          console.error("Sequence lookup error:", { workspace_id: targetWorkspaceId, error: seqFetchErr.message });
        } else if (defaultSeq) {
          const { data: firstStep, error: stepFetchErr } = await supabase
            .from("sequence_steps")
            .select("delay_days, delay_hours")
            .eq("sequence_id", defaultSeq.id)
            .eq("step_order", 1)
            .maybeSingle();

          if (stepFetchErr) {
            console.error("Sequence step lookup error:", { sequence_id: defaultSeq.id, error: stepFetchErr.message });
          }

          const delayMs = firstStep
            ? ((firstStep.delay_days ?? 0) * 86400 + (firstStep.delay_hours ?? 0) * 3600) * 1000
            : 0;

          const nextStepAt = new Date(Date.now() + delayMs).toISOString();

          const { data: enrollment, error: enrollErr } = await supabase
            .from("sequence_enrollments")
            .insert({
              workspace_id: defaultSeq.workspace_id,
              sequence_id: defaultSeq.id,
              contact_email: body.email.toLowerCase().trim(),
              contact_name: body.name.trim(),
              contact_phone: body.phone?.trim() ?? null,
              contact_data: { lead_id: lead?.id ?? "" },
              current_step: 0,
              status: "active",
              next_step_at: nextStepAt,
            })
            .select("id")
            .single();

          if (enrollErr) {
            console.error("Sequence enrollment insert error:", {
              workspace_id: targetWorkspaceId,
              sequence_id: defaultSeq.id,
              error: enrollErr.message,
            });
          } else {
            enrollmentId = enrollment?.id ?? null;
          }
        }
      } catch (seqErr) {
        const msg = seqErr instanceof Error ? seqErr.message : String(seqErr);
        console.error("Sequence auto-enrollment exception:", { workspace_id: targetWorkspaceId, error: msg });
      }
    }

    return json({
      success: true,
      message: "Kërkesa u regjistrua. Do t'ju kontaktojmë brenda 24 orëve.",
      lead_id: lead?.id ?? null,
      enrollment_id: enrollmentId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("public-lead-capture error:", msg);
    return json({ error: "Gabim i brendshëm. Provo sërish." }, 500);
  }
});
