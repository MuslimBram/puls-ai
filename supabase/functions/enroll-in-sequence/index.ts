// supabase/functions/enroll-in-sequence/index.ts
// ============================================================
// Regjistron kontakte në sekuencë automatikisht ose manualisht
// POST { sequence_id, contacts: [{email, name, phone, data}] }
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: {
    sequence_id: string;
    contacts: Array<{
      email: string;
      name?: string;
      phone?: string;
      data?: Record<string, string>;
      contact_id?: string;
      lead_id?: string;
    }>;
    start_immediately?: boolean;
  };

  try { body = await req.json(); }
  catch { return json({ error: "Body i pavlefshëm" }, 400); }

  const { sequence_id, contacts, start_immediately = true } = body;
  if (!sequence_id || !contacts?.length) {
    return json({ error: "sequence_id dhe contacts janë të detyrueshëm" }, 400);
  }

  // Verifiko sekuencën
  const { data: seq } = await supabase
    .from("sales_sequences")
    .select("id, status")
    .eq("id", sequence_id)
    .maybeSingle();

  if (!seq || seq.status !== "active") {
    return json({ error: "Sekuenca nuk ekziston ose nuk është aktive" }, 404);
  }

  // Merr hapin e parë (për të caktuar next_step_at)
  const { data: firstStep } = await supabase
    .from("sequence_steps")
    .select("delay_days, delay_hours")
    .eq("sequence_id", sequence_id)
    .eq("step_order", 1)
    .maybeSingle();

  const firstDelay = firstStep
    ? ((firstStep.delay_days ?? 0) * 86400 + (firstStep.delay_hours ?? 0) * 3600) * 1000
    : 0;

  const nextAt = start_immediately && firstDelay === 0
    ? new Date().toISOString()
    : new Date(Date.now() + Math.max(firstDelay, 60_000)).toISOString();

  let enrolled = 0;
  let skipped = 0;

  for (const contact of contacts) {
    if (!contact.email) continue;

    // Kontrollo nëse është tashmë enrolled
    const { data: existing } = await supabase
      .from("sequence_enrollments")
      .select("id, status")
      .eq("sequence_id", sequence_id)
      .eq("contact_email", contact.email.toLowerCase())
      .maybeSingle();

    if (existing && existing.status === "active") { skipped++; continue; }

    const { error } = await supabase
      .from("sequence_enrollments")
      .upsert({
        sequence_id,
        contact_email: contact.email.toLowerCase(),
        contact_name: contact.name ?? null,
        contact_phone: contact.phone ?? null,
        contact_data: contact.data ?? {},
        contact_id: contact.contact_id ?? null,
        current_step: 0,
        status: "active",
        next_step_at: nextAt,
        enrolled_at: new Date().toISOString(),
        enrolled_by: user.id,
        source_lead_id: contact.lead_id ?? null,
      }, { onConflict: "sequence_id,contact_email" });

    if (!error) enrolled++;
    else console.error(`Enroll error për ${contact.email}:`, error.message);
  }

  return json({ success: true, enrolled, skipped, total: contacts.length });
});
