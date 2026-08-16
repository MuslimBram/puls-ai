// supabase/functions/contacts-csv-import/index.ts
// ============================================================
// Importon kontakte nga CSV — multipart/form-data
// POST: file (CSV), business_id, skip_duplicates (opt)
// Kolonat e pranuara: name, email, phone, company, city, tags
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
    status: s, headers: { ...CORS, "Content-Type": "application/json" },
  });

// Parsim i thjeshtë CSV
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h =>
    h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "")
  );

  return lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      // Handle quoted fields
      const values: string[] = [];
      let curr = "", inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { values.push(curr.trim()); curr = ""; continue; }
        curr += ch;
      }
      values.push(curr.trim());

      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
      return row;
    })
    .filter(row => Object.values(row).some(v => v));
}

// Normalizim i emrave të kolonave
function normalizeRow(row: Record<string, string>): {
  name?: string; first_name?: string; last_name?: string;
  email?: string; phone?: string; company?: string;
  city?: string; country?: string; tags?: string; notes?: string;
} {
  const get = (...keys: string[]) =>
    keys.map(k => row[k] || row[k.replace(/_/g, "")] || "").find(v => v) ?? "";

  const fullName = get("name", "full_name", "emri", "emer");
  const firstName = get("first_name", "firstname", "emri") || fullName.split(" ")[0];
  const lastName = get("last_name", "lastname", "mbiemri") || fullName.split(" ").slice(1).join(" ");

  return {
    name: fullName || `${firstName} ${lastName}`.trim(),
    first_name: firstName,
    last_name: lastName,
    email: get("email", "email_address", "email_adresa", "emaili"),
    phone: get("phone", "phone_number", "tel", "telefon", "numri", "mobile")
      .replace(/\s/g, ""),
    company: get("company", "business", "firma", "kompania"),
    city: get("city", "qyteti", "location"),
    country: get("country", "shteti") || "AL",
    tags: get("tags", "etiketat", "kategoria"),
    notes: get("notes", "shenime", "description"),
  };
}

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

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  let csvText: string;
  let businessId: string;
  let skipDuplicates = true;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) return json({ error: "Fajlli CSV mungon" }, 400);
      csvText = await file.text();
      businessId = (form.get("business_id") as string) ?? "";
      skipDuplicates = form.get("skip_duplicates") !== "false";
    } catch {
      return json({ error: "Form data e pavlefshme" }, 400);
    }
  } else {
    const body = await req.json() as { csv_text?: string; business_id?: string; skip_duplicates?: boolean };
    csvText = body.csv_text ?? "";
    businessId = body.business_id ?? "";
    skipDuplicates = body.skip_duplicates !== false;
  }

  if (!csvText || !businessId) {
    return json({ error: "csv_text dhe business_id janë të detyrueshëm" }, 400);
  }

  const rows = parseCSV(csvText);
  if (rows.length === 0) return json({ error: "CSV bosh ose format i pavlefshëm" }, 400);

  // Krijo batch
  const { data: batch } = await supabase
    .from("import_batches")
    .insert({
      business_id: businessId,
      user_id: user.id,
      file_name: "import.csv",
      total_rows: rows.length,
      status: "processing",
    })
    .select("id").single();

  const batchId = batch?.id;

  let imported = 0, skipped = 0, duplicates = 0;
  const errorLog: string[] = [];

  for (const row of rows) {
    try {
      const contact = normalizeRow(row);
      if (!contact.name && !contact.email && !contact.phone) { skipped++; continue; }

      // Kontrollo duplikat (sipas email ose telefon)
      if (skipDuplicates && (contact.email || contact.phone)) {
        let dupQuery = supabase.from("customers")
          .select("id").eq("business_id", businessId);

        if (contact.email) {
          dupQuery = dupQuery.eq("email", contact.email.toLowerCase());
        } else if (contact.phone) {
          dupQuery = dupQuery.eq("whatsapp_phone", contact.phone);
        }

        const { data: dup } = await dupQuery.maybeSingle();
        if (dup) { duplicates++; skipped++; continue; }
      }

      const { error } = await supabase.from("customers").insert({
        business_id: businessId,
        name: contact.name,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email?.toLowerCase() || null,
        whatsapp_phone: contact.phone || null,
        company: contact.company || null,
        city: contact.city || null,
        country: contact.country || "AL",
        notes: contact.notes || null,
        tags: contact.tags
          ? contact.tags.split(/[;,|]/).map(t => t.trim()).filter(Boolean)
          : [],
        import_source: "csv",
        import_batch_id: batchId,
        lifecycle_stage: "lead",
      });

      if (error) { errorLog.push(`${contact.email ?? contact.name}: ${error.message}`); skipped++; }
      else imported++;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errorLog.push(msg);
      skipped++;
    }
  }

  // Përditëso batch
  await supabase.from("import_batches").update({
    imported, skipped, duplicates_found: duplicates,
    errors: errorLog.length, status: "completed",
    error_log: errorLog.slice(0, 50),
    completed_at: new Date().toISOString(),
  }).eq("id", batchId);

  return json({
    success: true,
    batch_id: batchId,
    total: rows.length,
    imported,
    skipped,
    duplicates_found: duplicates,
    errors: errorLog.length,
    error_sample: errorLog.slice(0, 5),
  });
});
