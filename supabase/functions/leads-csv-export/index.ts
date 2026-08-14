// supabase/functions/leads-csv-export/index.ts
// ============================================================
// Eksporton leads si CSV — për admin dhe business owner
// GET /leads-csv-export?status=new&from=2026-01-01&to=2026-12-31
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

function escapeCSV(val: unknown): string {
  if (val == null) return "";
  const str = String(val).replace(/"/g, '""');
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str}"`
    : str;
}

function rowToCSV(headers: string[], obj: Record<string, unknown>): string {
  return headers.map((h) => escapeCSV(obj[h])).join(",");
}

serve(async (req: Request): Promise<Response> => {
  const CORS = {
    ...getCors(req),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") {
    return new Response("GET only", { status: 405, headers: CORS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Verifiko user-in
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  // Verifiko rolin: vetëm admin / super_admin / owner mund të eksportojnë leads (PII)
  const { data: roleRows, error: roleErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (roleErr) {
    return new Response(JSON.stringify({ error: roleErr.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const isPrivileged = roles.some((r) => ["admin", "super_admin", "owner"].includes(r));
  if (!isPrivileged) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const source = url.searchParams.get("source");

  try {
    // Merr leads nga të dyja tabelat
    let query = supabase
      .from("enterprise_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (status) query = query.eq("status", status);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    if (source) query = query.eq("source", source);

    const { data: leads, error } = await query;
    if (error) throw error;

    if (!leads || leads.length === 0) {
      return new Response("Nuk ka leads për këto filtra.", {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    // Ndërto CSV
    const headers = [
      "id", "name", "email", "phone", "company_name",
      "message", "status", "source", "team_size",
      "utm_source", "utm_medium", "utm_campaign",
      "created_at",
    ];

    const rows = [
      headers.join(","),
      ...leads.map((lead) => rowToCSV(headers, lead as Record<string, unknown>)),
    ];

    const csv = rows.join("\n");
    const filename = `leads_${new Date().toISOString().split("T")[0]}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
