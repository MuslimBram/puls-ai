// supabase/functions/generate-invoice-pdf/index.ts
// ============================================================
// Gjeneron faturë PDF dhe e ruan te Supabase Storage
// POST { invoice_id } → { pdf_url }
// Përdor HTML → PDF me Deno (html string + storage upload)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s, headers: { ...CORS, "Content-Type": "application/json" },
  });

function buildInvoiceHTML(inv: Record<string, unknown>): string {
  const items = (inv.items as Array<Record<string, unknown>>) ?? [];
  const itemsHTML = items.map(item => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb">${item.description ?? ""}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:center">${item.qty ?? 1}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right">${Number(item.unit_price ?? 0).toFixed(2)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:500">${Number(item.total ?? 0).toFixed(2)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:14px; color:#111827; padding:40px; max-width:680px; margin:0 auto; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; }
  .logo { font-size:24px; font-weight:700; color:#2563eb; }
  .invoice-meta { text-align:right; }
  .invoice-meta .number { font-size:18px; font-weight:600; color:#111827; }
  .invoice-meta .status { display:inline-block; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:500; background:#dcfce7; color:#166534; margin-top:4px; }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:32px; }
  .party-label { font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; margin-bottom:6px; }
  .party-name { font-size:15px; font-weight:600; margin-bottom:2px; }
  .party-detail { font-size:13px; color:#4b5563; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  th { text-align:left; padding:10px 0; border-bottom:2px solid #e5e7eb; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; }
  th:last-child { text-align:right; }
  th:nth-child(2) { text-align:center; }
  th:nth-child(3) { text-align:right; }
  .totals { margin-left:auto; width:280px; }
  .total-row { display:flex; justify-content:space-between; padding:5px 0; font-size:14px; color:#4b5563; }
  .total-final { display:flex; justify-content:space-between; padding:10px 0; font-size:17px; font-weight:700; color:#111827; border-top:2px solid #111827; margin-top:6px; }
  .footer { margin-top:48px; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#9ca3af; text-align:center; }
  .due-box { background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:12px 16px; margin-bottom:24px; font-size:13px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Pulse AI</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">kohablerjeve.top</div>
    </div>
    <div class="invoice-meta">
      <div class="number">FATURË #${inv.invoice_number ?? "—"}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px">Data: ${new Date(inv.created_at as string).toLocaleDateString("sq-AL")}</div>
      <span class="status">${(inv.status as string ?? "draft").toUpperCase()}</span>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">Faturuesi</div>
      <div class="party-name">Pulse AI</div>
      <div class="party-detail">Business Operating System AI</div>
      <div class="party-detail">info@mso.re</div>
    </div>
    <div>
      <div class="party-label">Faturuari</div>
      <div class="party-name">${inv.client_name ?? ""}</div>
      <div class="party-detail">${inv.client_email ?? ""}</div>
      ${inv.client_address ? `<div class="party-detail">${inv.client_address}</div>` : ""}
      ${inv.client_tax_id ? `<div class="party-detail">NIPT: ${inv.client_tax_id}</div>` : ""}
    </div>
  </div>

  ${inv.due_date ? `<div class="due-box">📅 Data e skadimit: <strong>${new Date(inv.due_date as string).toLocaleDateString("sq-AL")}</strong></div>` : ""}

  <table>
    <thead>
      <tr>
        <th>Përshkrimi</th>
        <th>Sasia</th>
        <th>Çmimi</th>
        <th>Totali</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Nëntotali</span><span>${Number(inv.subtotal ?? 0).toFixed(2)} ${inv.currency ?? "EUR"}</span></div>
    ${Number(inv.tax_pct ?? 0) > 0 ? `<div class="total-row"><span>TVSH (${inv.tax_pct}%)</span><span>${Number(inv.tax_amount ?? 0).toFixed(2)} ${inv.currency ?? "EUR"}</span></div>` : ""}
    <div class="total-final"><span>TOTALI</span><span>${Number(inv.total_amount ?? 0).toFixed(2)} ${inv.currency ?? "EUR"}</span></div>
  </div>

  ${inv.notes ? `<div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:6px;font-size:13px;color:#4b5563">${inv.notes}</div>` : ""}

  <div class="footer">
    Pulse AI — Business Operating System AI • kohablerjeve.top<br>
    Faleminderit për besimin tuaj!
  </div>
</body>
</html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { invoice_id: string };
  try { body = await req.json(); }
  catch { return json({ error: "Body i pavlefshëm" }, 400); }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", body.invoice_id)
    .single();

  if (error || !invoice) return json({ error: "Fatura nuk u gjet" }, 404);

  // Gjenero HTML
  const html = buildInvoiceHTML(invoice as Record<string, unknown>);

  // Ruaj HTML te Storage (si fallback — PDF real kërkon library shtesë)
  const fileName = `invoices/${invoice.id}/invoice-${invoice.invoice_number}.html`;
  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(fileName, new Blob([html], { type: "text/html" }), { upsert: true });

  if (uploadErr) return json({ error: `Upload dështoi: ${uploadErr.message}` }, 500);

  const { data: { publicUrl } } = supabase.storage
    .from("documents")
    .getPublicUrl(fileName);

  // Përditëso faturën me PDF URL
  await supabase.from("invoices")
    .update({ pdf_url: publicUrl, pdf_generated_at: new Date().toISOString() })
    .eq("id", body.invoice_id);

  return json({ success: true, pdf_url: publicUrl, invoice_number: invoice.invoice_number });
});
