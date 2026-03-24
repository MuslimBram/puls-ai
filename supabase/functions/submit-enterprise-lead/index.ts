import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user?.id || !userData.user.email) throw new Error("Unauthorized");

    const body = await req.json();
    const { name, email, companyName, phone, teamSize, message } = body ?? {};
    const normalizedEmail = String(email || userData.user.email || "").trim();
    if (!normalizedEmail) throw new Error("Email is required");

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("workspace_id, plan")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const { data: lead, error: leadError } = await supabase
      .from("enterprise_leads")
      .insert({
        user_id: userData.user.id,
        workspace_id: subscription?.workspace_id ?? null,
        name: name || null,
        email: normalizedEmail,
        company_name: companyName || null,
        phone: phone || null,
        team_size: teamSize || null,
        message: message || null,
        source: "pricing_page",
        status: "new",
        metadata: {
          current_plan: subscription?.plan ?? "standard",
          submitted_from: "pricing",
        },
      })
      .select("id")
      .single();

    if (leadError) throw leadError;

    const { data: adminsAndOwners } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "owner"]);

    if (admins?.length) {
      await supabase.from("business_notifications").insert(
        admins.map((admin) => ({
          user_id: admin.user_id,
          notification_type: "enterprise_lead",
          category: "billing",
          title: "New enterprise lead",
          message: `${companyName || normalizedEmail} requested enterprise pricing.`,
          action_url: "/admin",
          metadata: { lead_id: lead.id, source: "pricing_page" },
        })),
      );
    }

    await supabase.from("audit_logs").insert({
      actor_id: userData.user.id,
      action: "enterprise_lead_created",
      target_id: lead.id,
      target_type: "enterprise_lead",
      metadata: { company_name: companyName || null, email: normalizedEmail },
    });

    return new Response(JSON.stringify({ success: true, leadId: lead.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
