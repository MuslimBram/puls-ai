// supabase/functions/vicidial-cdr-sync/index.ts
// ============================================================
// Sinkronizon CDR (Call Detail Records) nga Vicidial
// + transkriptim + analiza AI e bisedave
// Konfigurimi (Supabase Secrets):
//   VICIDIAL_API_URL   — https://vicidial.juaj.com/vicidial/non_agent_api.php
//   VICIDIAL_USER      — përdoruesi API
//   VICIDIAL_PASS      — fjalëkalimi API
//   VICIDIAL_SOURCE    — burimi (p.sh. "pulse_ai")
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Merr CDR nga Vicidial API
async function fetchVicidialCDR(
  dateStart: string,
  dateEnd: string
): Promise<Array<Record<string, string>>> {
  const API_URL = Deno.env.get("VICIDIAL_API_URL");
  const USER = Deno.env.get("VICIDIAL_USER");
  const PASS = Deno.env.get("VICIDIAL_PASS");
  const SOURCE = Deno.env.get("VICIDIAL_SOURCE") ?? "pulse_ai";

  if (!API_URL || !USER || !PASS) {
    throw new Error("Mungojnë: VICIDIAL_API_URL, VICIDIAL_USER, VICIDIAL_PASS");
  }

  const params = new URLSearchParams({
    source: SOURCE,
    user: USER,
    pass: PASS,
    function: "call_log",
    query_date: dateStart,
    end_date: dateEnd,
    stage: "ALL",
    format: "json",
  });

  const res = await fetch(`${API_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Vicidial API: ${res.status}`);

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : data.result ?? [];
  } catch {
    // Vicidial mund të kthejë pipe-separated
    const lines = text.split("\n").filter(l => l.trim() && !l.startsWith("SUCCESS"));
    return lines.map(line => {
      const parts = line.split("|");
      return {
        uniqueid: parts[0] ?? "",
        phone_number: parts[1] ?? "",
        agent_user: parts[2] ?? "",
        disposition: parts[3] ?? "",
        length_in_sec: parts[4] ?? "0",
        call_date: parts[5] ?? "",
        direction: parts[6] ?? "outbound",
        recording_filename: parts[7] ?? "",
      };
    });
  }
}

// AI analizon bisedën (nëse ka transkript)
async function analyzeCall(transcript: string): Promise<{
  summary: string;
  sentiment: string;
  lead_detected: boolean;
  key_topics: string[];
}> {
  try {
    const result = await askAI(
      "Ti je analizues i bisedave të shitjeve. Kthe VETËM JSON.",
      `Analize këtë bisedë telefonike dhe kthe:\n${transcript.substring(0, 1500)}\n\nJSON: {"summary":"1 fjali","sentiment":"positive|neutral|negative","lead_detected":true/false,"key_topics":["topic1"]}`,
      200
    );
    return JSON.parse(result.replace(/```json|```/g, "").trim());
  } catch {
    return { summary: "Bisedë e pa-analizuar", sentiment: "neutral", lead_detected: false, key_topics: [] };
  }
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

  if (!Deno.env.get("VICIDIAL_API_URL")) {
    return json({
      error: "Vicidial nuk është konfiguruar",
      setup: {
        step1: "Jepma: VICIDIAL_API_URL (p.sh. https://vicidial.juaj.com/vicidial/non_agent_api.php)",
        step2: "Jepma: VICIDIAL_USER dhe VICIDIAL_PASS (llogaria API, jo agent)",
        step3: "Aktivizo API te Vicidial: admin → api_settings → enable=Y",
        step4: "Shto te Supabase Secrets dhe redeploy funksionin",
      }
    }, 503);
  }

  let body: { date_start?: string; date_stop?: string; workspace_id?: string; analyze_with_ai?: boolean } = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /**/ }
  }

  const dateStop = body.date_stop ?? new Date().toISOString().split("T")[0];
  const dateStart = body.date_start ?? (() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  })();

  try {
    const calls = await fetchVicidialCDR(dateStart, dateStop);
    let synced = 0, skipped = 0, aiAnalyzed = 0;

    for (const call of calls) {
      if (!call.uniqueid) continue;

      // Kontrollo nëse ekziston
      const { data: existing } = await supabase
        .from("call_records")
        .select("id")
        .eq("vicidial_id", call.uniqueid)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      let aiData = { summary: "", sentiment: "neutral", lead_detected: false, key_topics: [] as string[] };

      // AI analizo nëse ka transkript dhe është kërkuar
      if (body.analyze_with_ai && call.recording_filename) {
        aiData = await analyzeCall(`Agjent: ${call.agent_user}, Dispozicion: ${call.disposition}, Kohëzgjatja: ${call.length_in_sec}s`);
        aiAnalyzed++;
      }

      await supabase.from("call_records").insert({
        workspace_id: body.workspace_id ?? user.id,
        vicidial_id: call.uniqueid,
        caller_phone: call.phone_number,
        agent_name: call.agent_user,
        direction: call.direction === "inbound" ? "inbound" : "outbound",
        duration_sec: parseInt(call.length_in_sec ?? "0"),
        disposition: call.disposition,
        recording_url: call.recording_filename ? `${Deno.env.get("VICIDIAL_API_URL")?.split("/vicidial")[0]}/recordings/${call.recording_filename}` : null,
        ai_summary: aiData.summary || null,
        ai_sentiment: aiData.sentiment,
        lead_detected: aiData.lead_detected,
        called_at: call.call_date ? new Date(call.call_date).toISOString() : new Date().toISOString(),
      }).catch(() => { skipped++; return null; });

      synced++;
    }

    // Përditëso KPI snapshot me të dhënat e thirrjeve
    await supabase.from("kpi_daily_snapshots").upsert({
      workspace_id: body.workspace_id ?? user.id,
      snapshot_date: dateStop,
      total_calls: calls.length,
      answered_calls: calls.filter(c => parseInt(c.length_in_sec ?? "0") > 10).length,
    }, { onConflict: "workspace_id,snapshot_date" }).catch(() => {});

    return json({
      success: true,
      period: { from: dateStart, to: dateStop },
      total_calls: calls.length,
      synced,
      skipped,
      ai_analyzed: aiAnalyzed,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
