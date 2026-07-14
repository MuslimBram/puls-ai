// supabase/functions/sales-sequence-engine/index.ts
// ============================================================
// Motor i sekuencave — thirret nga cron çdo 30 minuta
// 1. Gjen enrollments që kanë next_step_at <= tani
// 2. Ekzekuton hapin e radhës (email / WA / SMS / task)
// 3. Cakton next_step_at për hapin tjetër
// 4. A/B testing automatik (50/50 split)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// ── Zëvendëso variablat {{name}}, {{business}}, etj ──────────
function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
}

// ── Personalizo me AI nëse template ka {{ai_personalize}} ────
async function personalizeWithAI(
  template: string,
  contactData: Record<string, string>
): Promise<string> {
  if (!template.includes("{{ai_personalize}}")) {
    return renderTemplate(template, contactData);
  }

  const base = renderTemplate(
    template.replace("{{ai_personalize}}", ""),
    contactData
  );

  try {
    const personalized = await askAI(
      `Ti je ekspert shitjesh. Personalizoje këtë mesazh për kontaktin duke e bërë të natyrshëm dhe bindës. 
Kthe VETËM mesazhin e personalizuar, asgjë tjetër.`,
      `Mesazhi bazë: ${base}\nKontakti: ${JSON.stringify(contactData)}`,
      300
    );
    return personalized;
  } catch {
    return base;
  }
}

// ── Dërgo mesazh sipas kanalit ───────────────────────────────
async function executeStep(
  supabase: ReturnType<typeof createClient>,
  enrollment: Record<string, unknown>,
  step: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const contactData: Record<string, string> = {
    name: (enrollment.contact_name as string) ?? "Mik",
    email: (enrollment.contact_email as string) ?? "",
    phone: (enrollment.contact_phone as string) ?? "",
    ...(enrollment.contact_data as Record<string, string> ?? {}),
  };

  const variant = enrollment.ab_variant as string;
  let bodyTemplate = (step.body_template as string) ?? "";
  if (variant === "a" && step.variant_a_body) bodyTemplate = step.variant_a_body as string;
  if (variant === "b" && step.variant_b_body) bodyTemplate = step.variant_b_body as string;

  const body = await personalizeWithAI(bodyTemplate, contactData);
  const subject = renderTemplate((step.subject as string) ?? "", contactData);
  const channel = step.channel as string;

  if (channel === "email") {
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          to: enrollment.contact_email,
          subject,
          html: body.replace(/\n/g, "<br>"),
        }),
      }
    );
    if (!res.ok) return { success: false, error: `Email dështoi: ${res.status}` };
    return { success: true };
  }

  if (channel === "whatsapp" || channel === "sms") {
    const fn = channel === "whatsapp" ? "send-whatsapp-message" : "send-sms";
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ to: enrollment.contact_phone, message: body }),
      }
    );
    if (!res.ok) return { success: false, error: `${channel} dështoi: ${res.status}` };
    return { success: true };
  }

  if (channel === "internal_task") {
    await supabase.from("tasks").insert({
      title: subject || "Follow-up sekuencë",
      description: body,
      assigned_to: (step.config as Record<string, string>)?.assigned_to ?? null,
      due_date: new Date(Date.now() + 24 * 3600_000).toISOString(),
      related_contact_email: enrollment.contact_email,
      status: "pending",
      source: "sequence_automation",
    }).catch(() => {});
    return { success: true };
  }

  return { success: false, error: `Kanal i panjohur: ${channel}` };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const now = new Date().toISOString();
  let processed = 0, completed = 0, failed = 0;

  try {
    // ── 1. Gjej enrollments gati për hapin tjetër ────────────
    const { data: enrollments } = await supabase
      .from("sequence_enrollments")
      .select(`
        *,
        sales_sequences (
          id, name, status
        )
      `)
      .eq("status", "active")
      .lte("next_step_at", now)
      .limit(100);

    for (const enrollment of enrollments ?? []) {
      if (enrollment.sales_sequences?.status !== "active") continue;

      const nextStepOrder = (enrollment.current_step as number) + 1;

      // Merr hapin tjetër
      const { data: step } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", enrollment.sequence_id)
        .eq("step_order", nextStepOrder)
        .maybeSingle();

      if (!step) {
        // Nuk ka hap tjetër — sekuenca u kompletua
        await supabase
          .from("sequence_enrollments")
          .update({ status: "completed", completed_at: now })
          .eq("id", enrollment.id);
        completed++;
        continue;
      }

      // Cakto variant A/B nëse hapi ka testing
      let variant = "none";
      if (step.variant_a_body && step.variant_b_body) {
        variant = Math.random() < (step.ab_split_pct ?? 50) / 100 ? "a" : "b";
        // Ruaj variant te enrollment
        await supabase
          .from("sequence_enrollments")
          .update({ ab_variant: variant })
          .eq("id", enrollment.id);
      }

      // Ekzekuto hapin
      const { success, error: stepError } = await executeStep(
        supabase, 
        { ...enrollment, ab_variant: variant } as Record<string, unknown>,
        step as Record<string, unknown>
      );

      // Log ekzekutimin
      await supabase.from("sequence_step_executions").insert({
        enrollment_id: enrollment.id,
        step_id: step.id,
        step_order: nextStepOrder,
        ab_variant_used: variant,
        status: success ? "sent" : "failed",
        channel_used: step.channel,
        error_message: stepError ?? null,
        executed_at: now,
      }).catch(() => {});

      if (success) {
        // Llogarit next_step_at (kur të ekzekutohet hapi i ardhshëm)
        const { data: nextStep } = await supabase
          .from("sequence_steps")
          .select("delay_days, delay_hours")
          .eq("sequence_id", enrollment.sequence_id)
          .eq("step_order", nextStepOrder + 1)
          .maybeSingle();

        let nextAt: string | null = null;
        if (nextStep) {
          const ms =
            ((nextStep.delay_days ?? 0) * 86400 +
              (nextStep.delay_hours ?? 0) * 3600) *
            1000;
          nextAt = new Date(Date.now() + Math.max(ms, 60_000)).toISOString();
        }

        await supabase
          .from("sequence_enrollments")
          .update({
            current_step: nextStepOrder,
            next_step_at: nextAt,
            status: nextAt ? "active" : "completed",
            completed_at: nextAt ? null : now,
          })
          .eq("id", enrollment.id);

        processed++;
      } else {
        failed++;
        console.error(`Step ${nextStepOrder} dështoi për ${enrollment.contact_email}: ${stepError}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, completed, failed }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sales-sequence-engine error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
