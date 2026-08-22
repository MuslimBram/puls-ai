// supabase/functions/appointment-booking/index.ts
// ============================================================
// Sistem rezervimesh online — si Calendly
// GET  ?action=availability&workspace_id=&date= → orët e lira
// POST ?action=book     → rezervo takim
// POST ?action=confirm  → konfirmo me token
// POST ?action=cancel   → anulo
// POST ?action=remind   → dërgo kujtesa (cron)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function isTrustedInternal(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const internal = req.headers.get("x-internal-secret");
  const configuredInternal = Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "";
  return Boolean(
    bearer && configuredInternal && bearer === getServiceKey() && internal === configuredInternal,
  );
}

// Gjenero slots të lirë për datën
function generateSlots(start: string, end: string, durationMin: number, bufferMin: number): string[] {
  const slots: string[] = [];
  const startTime = new Date(`2000-01-01T${start}`);
  const endTime = new Date(`2000-01-01T${end}`);
  const step = (durationMin + bufferMin) * 60_000;
  let cur = startTime;
  while (cur.getTime() + durationMin * 60_000 <= endTime.getTime()) {
    slots.push(cur.toTimeString().slice(0, 5));
    cur = new Date(cur.getTime() + step);
  }
  return slots;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey()!, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "availability";

  // ── AVAILABILITY (publik — pa auth) ─────────────────────────
  if (action === "availability" && req.method === "GET") {
    const workspaceId = url.searchParams.get("workspace_id");
    const date = url.searchParams.get("date");
    const typeId = url.searchParams.get("type_id");

    if (!workspaceId || !date) return json({ error: "workspace_id dhe date janë të detyrueshme" }, 400);

    const dayOfWeek = new Date(date).getDay();

    const { data: rule } = await supabase.from("availability_rules")
      .select("start_time, end_time, is_available")
      .eq("workspace_id", workspaceId).eq("day_of_week", dayOfWeek).maybeSingle();

    if (!rule?.is_available) return json({ date, available_slots: [], reason: "E mbyllur" });

    let typeQuery = supabase.from("appointment_types")
      .select("duration_min, buffer_min, max_per_day")
      .eq("workspace_id", workspaceId);
    if (typeId) typeQuery = typeQuery.eq("id", typeId);
    else typeQuery = typeQuery.eq("is_active", true);
    const { data: apptType } = await typeQuery.limit(1).maybeSingle();

    const duration = apptType?.duration_min ?? 60;
    const buffer = apptType?.buffer_min ?? 15;
    const allSlots = generateSlots(rule.start_time, rule.end_time, duration, buffer);

    const { data: booked } = await supabase.from("appointments")
      .select("starts_at, ends_at")
      .eq("workspace_id", workspaceId)
      .gte("starts_at", `${date}T00:00:00`)
      .lte("starts_at", `${date}T23:59:59`)
      .not("status", "in", '("cancelled","no_show")');

    const bookedTimes = (booked ?? []).map((a: Record<string, string>) =>
      new Date(a.starts_at).toTimeString().slice(0, 5));

    const freeSlots = allSlots.filter(s => !bookedTimes.includes(s));
    return json({ date, available_slots: freeSlots, duration_min: duration });
  }

  // ── BOOK (publik; AI-3 correlation is internal-only) ───────────────────────
  if (action === "book" && req.method === "POST") {
    let body: {
      workspace_id: string;
      type_id?: string;
      client_name: string;
      client_email?: string;
      client_phone?: string;
      date: string;
      time: string;
      notes?: string;
      ai3_action_id?: string;
    };
    try { body = await req.json(); } catch { return json({ error: "Body i pavlefshëm" }, 400); }

    const {
      workspace_id, type_id, client_name, client_email, client_phone, date, time, notes, ai3_action_id,
    } = body;
    if (!workspace_id || !client_name || !date || !time) {
      return json({ error: "Fushat e detyrueshme mungojnë" }, 400);
    }

    if (ai3_action_id && !isTrustedInternal(req)) {
      return json({ error: "ai3_action_id is internal-only" }, 403);
    }

    // AI-5 idempotency: a completed downstream call may be retried if the worker
    // dies before marking its AI-3 action COMPLETED. Reuse the durable appointment.
    if (ai3_action_id) {
      const { data: existing } = await supabase.from("appointments")
        .select("id,confirmation_token")
        .eq("workspace_id", workspace_id)
        .eq("ai3_action_id", ai3_action_id)
        .maybeSingle();
      if (existing) {
        return json({
          success: true,
          appointment_id: existing.id,
          confirmation_token: existing.confirmation_token,
          idempotent_replay: true,
        });
      }
    }

    let apptType: Record<string, any> | null = null;
    if (type_id) {
      const { data } = await supabase.from("appointment_types")
        .select("*")
        .eq("id", type_id)
        .eq("workspace_id", workspace_id)
        .eq("is_active", true)
        .maybeSingle();
      if (!data) return json({ error: "Lloji i rezervimit nuk i përket këtij workspace" }, 400);
      apptType = data;
    }

    const duration = apptType?.duration_min ?? 60;
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const endsAt = new Date(new Date(`${date}T${time}:00`).getTime() + duration * 60_000).toISOString();

    const { data: conflict } = await supabase.from("appointments")
      .select("id")
      .eq("workspace_id", workspace_id)
      .lt("starts_at", endsAt).gt("ends_at", startsAt)
      .not("status", "in", '("cancelled","no_show")')
      .maybeSingle();

    if (conflict) return json({ error: "Ky slot nuk është i disponueshëm" }, 409);

    const { data: appt, error: insertError } = await supabase.from("appointments").insert({
      workspace_id,
      type_id: type_id ?? null,
      client_name,
      client_email: client_email ?? null,
      client_phone: client_phone ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "confirmed",
      notes: notes ?? null,
      amount_lek: apptType?.price_lek ?? 0,
      source: ai3_action_id ? "ai3_golden_journey" : "online_booking",
      ai3_action_id: ai3_action_id ?? null,
    }).select("id, confirmation_token").single();

    if (insertError) {
      // Unique ai3_action_id race: return the row created by the competing retry.
      if (ai3_action_id) {
        const { data: raced } = await supabase.from("appointments")
          .select("id,confirmation_token")
          .eq("workspace_id", workspace_id)
          .eq("ai3_action_id", ai3_action_id)
          .maybeSingle();
        if (raced) {
          return json({
            success: true,
            appointment_id: raced.id,
            confirmation_token: raced.confirmation_token,
            idempotent_replay: true,
          });
        }
      }
      return json({ error: "Rezervimi nuk u krijua" }, 500);
    }

    if (client_email && appt) {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getServiceKey()}` },
        body: JSON.stringify({
          to: client_email,
          subject: `Rezervim i konfirmuar — ${apptType?.name ?? "Takim"}`,
          html: `<div style="font-family:sans-serif;max-width:500px">
            <h2>Rezervim i konfirmuar ✅</h2>
            <p>Të nderuar <strong>${client_name}</strong>,</p>
            <p>Rezervimi juaj u konfirmua:</p>
            <ul>
              <li><strong>Shërbimi:</strong> ${apptType?.name ?? "Takim"}</li>
              <li><strong>Data:</strong> ${new Date(startsAt).toLocaleDateString("sq-AL")}</li>
              <li><strong>Ora:</strong> ${time}</li>
              <li><strong>Kohëzgjatja:</strong> ${duration} minuta</li>
            </ul>
            <a href="${Deno.env.get("DASHBOARD_URL")}/cancel-appointment?token=${appt.confirmation_token}"
               style="color:#ef4444;font-size:13px">Anulo rezervimin</a>
          </div>`,
        }),
      }).catch(() => {});
    }

    return json({ success: true, appointment_id: appt?.id, confirmation_token: appt?.confirmation_token });
  }

  // ── REMINDERS (cron) ────────────────────────────────────────
  if (action === "remind") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const { data: upcoming } = await supabase.from("appointments")
      .select("*")
      .gte("starts_at", `${dateStr}T00:00:00`)
      .lte("starts_at", `${dateStr}T23:59:59`)
      .eq("status", "confirmed")
      .eq("reminder_sent", false);

    let sent = 0;
    for (const appt of upcoming ?? []) {
      if (!appt.client_email) continue;
      const ok = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getServiceKey()}` },
        body: JSON.stringify({
          to: appt.client_email,
          subject: "Kujtesë rezervimi — nesër",
          html: `<div style="font-family:sans-serif"><h3>Kujtesë ⏰</h3><p>Ju kujtojmë se keni takim nesër:<br><strong>${new Date(appt.starts_at).toLocaleString("sq-AL")}</strong></p></div>`,
        }),
      }).then(r => r.ok).catch(() => false);

      if (ok) { sent++; await supabase.from("appointments").update({ reminder_sent: true }).eq("id", appt.id); }
    }
    return json({ success: true, reminders_sent: sent });
  }

  return json({ error: "Veprim i panjohur" }, 400);
});
