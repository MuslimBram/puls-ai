import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }
    const user = userRes.user;

    const body = await req.json();
    const { subject, description, category = "general", priority = "normal", workspace_id = null } = body || {};

    if (!subject || !description || subject.length < 3 || description.length < 5) {
      return new Response(JSON.stringify({ error: "subject and description required" }), {
        status: 400, headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    // Insert ticket
    const { data: ticket, error: tErr } = await admin
      .from("support_tickets")
      .insert({
        requester_user_id: user.id,
        requester_email: user.email,
        workspace_id,
        subject: String(subject).slice(0, 200),
        description: String(description).slice(0, 5000),
        category: String(category).slice(0, 50),
        priority: ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal",
        status: "open",
      })
      .select()
      .single();

    if (tErr) throw tErr;

    // Initial message from requester
    await admin.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_user_id: user.id,
      sender_role: "user",
      body: String(description).slice(0, 5000),
    });

    // Notify admins via business_notifications (admin-visible)
    const { data: admins } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);

    if (admins && admins.length > 0) {
      const notifications = admins.map((a: { user_id: string }) => ({
        user_id: a.user_id,
        title: `🎫 New support ticket: ${ticket.subject}`,
        message: `From ${user.email || user.id} • Priority: ${ticket.priority}`,
        notification_type: "system",
        category: "support",
        action_url: `/admin/support-tickets?id=${ticket.id}`,
        metadata: { ticket_id: ticket.id, requester: user.email },
      }));
      await admin.from("business_notifications").insert(notifications);
    }

    return new Response(JSON.stringify({ ticket }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("submit-ticket error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
