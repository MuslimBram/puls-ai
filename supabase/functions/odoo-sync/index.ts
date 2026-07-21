// supabase/functions/odoo-sync/index.ts
// ============================================================
// PULSE AI ↔ ODOO ERP Integration
// Bidirectional sync: Leads, Contacts, Invoices, Orders
//
// Konfigurimi (Supabase Secrets):
//   ODOO_URL      — https://odoo.biznesijuaj.com
//   ODOO_DB       — emri i databazës Odoo
//   ODOO_USER     — emaili i përdoruesit API
//   ODOO_PASSWORD — fjalëkalimi ose API key
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Odoo JSON-RPC Client
class OdooClient {
  private url: string;
  private db: string;
  private uid: number | null = null;

  constructor(url: string, db: string) {
    this.url = url.replace(/\/$/, "");
    this.db = db;
  }

  private async rpc(endpoint: string, params: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.url}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params,
      }),
    });
    const data = await res.json() as { result?: unknown; error?: { message: string } };
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async login(user: string, password: string): Promise<number> {
    const uid = await this.rpc("/web/dataset/call_kw", {
      model: "res.users",
      method: "authenticate",
      args: [this.db, user, password, {}],
      kwargs: {},
    }) as number;
    this.uid = uid;
    return uid;
  }

  async search_read(model: string, domain: unknown[][], fields: string[], limit = 100): Promise<Array<Record<string, unknown>>> {
    return await this.rpc("/web/dataset/call_kw", {
      model,
      method: "search_read",
      args: [domain],
      kwargs: { fields, limit },
    }) as Array<Record<string, unknown>>;
  }

  async create(model: string, values: Record<string, unknown>): Promise<number> {
    return await this.rpc("/web/dataset/call_kw", {
      model,
      method: "create",
      args: [values],
      kwargs: {},
    }) as number;
  }

  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return await this.rpc("/web/dataset/call_kw", {
      model,
      method: "write",
      args: [ids, values],
      kwargs: {},
    }) as boolean;
  }
}

async function getOdooClient(): Promise<OdooClient | null> {
  const url = Deno.env.get("ODOO_URL");
  const db = Deno.env.get("ODOO_DB");
  const user = Deno.env.get("ODOO_USER");
  const password = Deno.env.get("ODOO_PASSWORD");
  if (!url || !db || !user || !password) return null;

  const client = new OdooClient(url, db);
  await client.login(user, password);
  return client;
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

  if (!Deno.env.get("ODOO_URL")) {
    return json({
      error: "Odoo nuk është konfiguruar",
      setup: {
        required_secrets: ["ODOO_URL", "ODOO_DB", "ODOO_USER", "ODOO_PASSWORD"],
        guide: "https://www.odoo.com/documentation/17.0/developer/reference/external_api.html",
        plans: "Odoo Community (falas) ose Odoo Enterprise ($24.90-$61/user/muaj)",
        modules_needed: ["crm", "sale", "account", "stock", "project", "hr"],
      }
    }, 503);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /**/ }
  }

  const workspaceId = (body.workspace_id as string) ?? user.id;

  try {
    const odoo = await getOdooClient();
    if (!odoo) return json({ error: "Lidhja me Odoo dështoi" }, 503);

    // ── STATUS ────────────────────────────────────────────────
    if (action === "status") {
      const companies = await odoo.search_read("res.company", [], ["name", "email", "phone"], 1);
      return json({
        connected: true,
        company: companies[0] ?? {},
        available_actions: ["sync_leads", "sync_contacts", "sync_invoices", "create_lead", "create_invoice"],
      });
    }

    // ── SYNC LEADS: Pulse AI → Odoo CRM ─────────────────────
    if (action === "sync_leads") {
      const { data: leads } = await supabase
        .from("public_leads")
        .select("*")
        .eq("status", "qualified")
        .is("odoo_id", null)
        .limit(50);

      let synced = 0;
      for (const lead of leads ?? []) {
        const odooId = await odoo.create("crm.lead", {
          name: `Lead: ${lead.name} (${lead.business_name ?? "pa biznes"})`,
          contact_name: lead.name,
          email_from: lead.email,
          phone: lead.phone ?? "",
          description: `${lead.message ?? ""}\n\nAI Score: ${lead.ai_score}\nIntent: ${lead.ai_intent}\nSource: Pulse AI`,
          type: "lead",
          tag_ids: [],
        });

        await supabase.from("public_leads")
          .update({ odoo_id: odooId } as Record<string, unknown>)
          .eq("id", lead.id);
        synced++;
      }
      return json({ success: true, synced, message: `${synced} leads u sinkronizuan te Odoo CRM` });
    }

    // ── SYNC CONTACTS: Pulse AI → Odoo ───────────────────────
    if (action === "sync_contacts") {
      const { data: contacts } = await supabase
        .from("customers")
        .select("*")
        .eq("business_id", workspaceId)
        .not("email", "is", null)
        .limit(100);

      let synced = 0;
      for (const contact of contacts ?? []) {
        // Kontrollo nëse ekziston te Odoo
        const existing = await odoo.search_read("res.partner",
          [["email", "=", contact.email]], ["id"], 1);

        if (existing.length > 0) {
          await odoo.write("res.partner", [existing[0].id as number], {
            phone: contact.phone ?? "",
            comment: `Pulse AI Customer · Channel: ${contact.source_channel_id ?? "unknown"}`,
          });
        } else {
          await odoo.create("res.partner", {
            name: contact.name ?? contact.display_name ?? contact.email,
            email: contact.email,
            phone: contact.phone ?? "",
            customer_rank: 1,
            comment: `Importuar nga Pulse AI · ${new Date().toLocaleDateString("sq-AL")}`,
          });
        }
        synced++;
      }
      return json({ success: true, synced });
    }

    // ── SYNC INVOICES: Odoo → Pulse AI ──────────────────────
    if (action === "sync_invoices") {
      const sinceDate = (body.since as string) ?? new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0];
      const odooInvoices = await odoo.search_read("account.move",
        [["move_type", "=", "out_invoice"], ["invoice_date", ">=", sinceDate]],
        ["name", "partner_id", "amount_total", "state", "invoice_date", "invoice_date_due"],
        100
      );

      let upserted = 0;
      for (const inv of odooInvoices) {
        await supabase.from("invoices").upsert({
          workspace_id: workspaceId,
          invoice_number: inv.name as string,
          client_name: (inv.partner_id as [number, string])[1] ?? "I panjohur",
          client_email: "",
          items: [{ description: "Nga Odoo ERP", qty: 1, unit_price: inv.amount_total, total: inv.amount_total }],
          subtotal: inv.amount_total as number,
          total_amount: inv.amount_total as number,
          status: inv.state === "posted" ? "sent" : "draft",
          due_date: inv.invoice_date_due as string ?? null,
          source: "odoo_sync",
        }, { onConflict: "invoice_number" });
        upserted++;
      }
      return json({ success: true, invoices_synced: upserted });
    }

    // ── CREATE LEAD directly ──────────────────────────────────
    if (action === "create_lead") {
      const id = await odoo.create("crm.lead", {
        name: body.name as string ?? "Lead nga Pulse AI",
        email_from: body.email as string ?? "",
        phone: body.phone as string ?? "",
        description: body.description as string ?? "",
        type: "lead",
        priority: (body.priority as string) ?? "0",
      });
      return json({ success: true, odoo_lead_id: id });
    }

    return json({ error: "Veprim i panjohur", actions: ["status","sync_leads","sync_contacts","sync_invoices","create_lead"] }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
