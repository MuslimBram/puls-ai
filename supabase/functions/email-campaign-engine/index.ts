// supabase/functions/email-campaign-engine/index.ts
// ============================================================
// Motor email kampanjash — si ActiveCampaign
// POST ?action=send       → dërgon kampanjën
// POST ?action=schedule   → planifikon për datë të caktuar
// POST ?action=stats      → statistikat e kampanjës
// GET  ?action=track&id=  → pixel tracking (opens)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Render template me variabla
function renderTemplate(html: string, data: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? "");
}

// Dërgo email me Resend API (fallback: Supabase mailer)
async function sendEmail(to: string, subject: string, html: string, fromName: string, fromEmail: string): Promise<boolean> {
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");

  if (RESEND_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html }),
      });
      return res.ok;
    } catch { /* fallback */ }
  }

  // Fallback: Supabase Edge send-email
  const res = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ to, subject, html }),
    }
  );
  return res.ok;
}

// Gjenero AI-powered subject line B për A/B testing
async function generateSubjectB(subjectA: string, businessName: string): Promise<string> {
  try {
    return await askAI(
      "Ti je ekspert email marketing. Gjenero vetëm subject line alternativ (pa asnjë shpjegim).",
      `Subject origjinal: "${subjectA}" për biznesin "${businessName}"\nGjenero variant B që të jetë ≤50 karaktere, emocional dhe intrigues.`,
      60
    );
  } catch { return subjectA; }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Pixel tracking (GET — pa auth)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get("id");
    if (trackingId) {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await supabase.from("email_campaign_sends")
        .update({ status: "opened", opened_at: new Date().toISOString() })
        .eq("tracking_id", trackingId)
        .eq("status", "delivered");
      // Kthe pixel 1x1 transparent
      return new Response(
        atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
        { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } }
      );
    }
    return json({ error: "Missing tracking id" }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "send";
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }

  // ── SEND ────────────────────────────────────────────────────
  if (action === "send") {
    const { campaign_id, workspace_id } = body as { campaign_id: string; workspace_id: string };

    const { data: campaign } = await supabase.from("email_campaigns").select("*").eq("id", campaign_id).single();
    if (!campaign) return json({ error: "Kampanja nuk u gjet" }, 404);
    if (!["draft","scheduled"].includes(campaign.status)) return json({ error: "Kampanja nuk mund të dërgohet" }, 400);

    // Merr listën e marrësve nga customers
    const { data: contacts } = await supabase
      .from("customers")
      .select("email, name, display_name")
      .eq("business_id", workspace_id)
      .eq("opted_out_of_offers", false)
      .not("email", "is", null)
      .limit(10000);

    if (!contacts?.length) return json({ error: "Nuk ka kontakte me email" }, 400);

    // Gjenero subject B nëse A/B test
    let subjectB = campaign.subject_b;
    if (campaign.ab_test && !subjectB) {
      subjectB = await generateSubjectB(campaign.subject, "biznes");
    }

    // Shto te queue
    const sends = contacts.map((c: Record<string, string>, i: number) => ({
      campaign_id,
      contact_email: c.email,
      contact_name: c.display_name ?? c.name ?? "",
      variant: campaign.ab_test ? (i % 2 === 0 ? "a" : "b") : "a",
      status: "queued",
    }));

    await supabase.from("email_campaign_sends").upsert(sends, { onConflict: "campaign_id,contact_email" });

    // Dërgim batch-eve 50 kontakte
    let sent = 0, failed = 0;
    const BATCH = 50;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    for (let i = 0; i < contacts.length; i += BATCH) {
      const batch = contacts.slice(i, i + BATCH);
      await Promise.all(batch.map(async (c: Record<string, string>, j: number) => {
        const isB = campaign.ab_test && (i + j) % 2 === 1;
        const subject = isB && subjectB ? subjectB : campaign.subject;
        const htmlBody = isB && campaign.body_html_b ? campaign.body_html_b : campaign.body_html;
        const name = c.display_name ?? c.name ?? "Klient";

        // Shto pixel tracking + unsubscribe link
        const trackSend = sends.find((s: Record<string, string>) => s.contact_email === c.email);
        const trackUrl = `${SUPABASE_URL}/functions/v1/email-campaign-engine?action=track&id=${trackSend?.tracking_id ?? ""}`;
        const unsub = `${Deno.env.get("DASHBOARD_URL") ?? ""}/unsubscribe?email=${encodeURIComponent(c.email)}`;

        const finalHtml = renderTemplate(htmlBody, { name, email: c.email }) +
          `<img src="${trackUrl}" width="1" height="1" style="display:none">` +
          `<p style="font-size:11px;color:#999;margin-top:20px;text-align:center"><a href="${unsub}">Çregjistrohu nga emailet</a></p>`;

        const ok = await sendEmail(c.email, subject, finalHtml, campaign.from_name, campaign.from_email);
        if (ok) {
          sent++;
          await supabase.from("email_campaign_sends")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("campaign_id", campaign_id).eq("contact_email", c.email);
        } else { failed++; }
      }));

      // Pause midis batch-eve (rate limiting)
      await new Promise(r => setTimeout(r, 200));
    }

    await supabase.from("email_campaigns").update({
      status: "sent", sent_at: new Date().toISOString(),
      recipient_count: contacts.length,
    }).eq("id", campaign_id);

    return json({ success: true, sent, failed, total: contacts.length });
  }

  // ── STATS ───────────────────────────────────────────────────
  if (action === "stats") {
    const { campaign_id } = body as { campaign_id: string };
    const { data } = await supabase.from("email_campaign_sends")
      .select("status, variant")
      .eq("campaign_id", campaign_id);

    const stats = { total: 0, sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0,
      open_rate: 0, click_rate: 0, variant_a_opens: 0, variant_b_opens: 0 };

    for (const s of data ?? []) {
      stats.total++;
      if (["sent","delivered","opened","clicked"].includes(s.status)) stats.sent++;
      if (s.status === "opened" || s.status === "clicked") { stats.opened++; if (s.variant === "a") stats.variant_a_opens++; else stats.variant_b_opens++; }
      if (s.status === "clicked") stats.clicked++;
      if (s.status === "bounced") stats.bounced++;
      if (s.status === "unsubscribed") stats.unsubscribed++;
    }
    if (stats.sent > 0) { stats.open_rate = Math.round(stats.opened / stats.sent * 100); stats.click_rate = Math.round(stats.clicked / stats.sent * 100); }

    return json(stats);
  }

  return json({ error: "Veprim i panjohur" }, 400);
});
