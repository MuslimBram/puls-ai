import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WhatsApp Template Manager
 *
 * Manages the lifecycle of WhatsApp Business message templates:
 *   POST { action: "create", template: {...} }   — create/save template locally
 *   POST { action: "submit", template_id: ... }   — submit to Meta for approval
 *   POST { action: "sync", user_id: ... }          — sync statuses from Meta
 *   POST { action: "delete", template_id: ... }    — delete template
 *
 * Requires WA_BUSINESS_ACCOUNT_ID + WA_ACCESS_TOKEN in channel settings.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { action, template, template_id, user_id } = await req.json();

    // === CREATE / UPDATE LOCAL TEMPLATE ===
    if (action === "create") {
      if (!template?.user_id || !template?.template_name || !template?.body_text) {
        return jsonRes({ error: "Missing required fields: user_id, template_name, body_text" }, 400);
      }

      const { data, error } = await supabase
        .from("whatsapp_templates")
        .upsert({
          user_id: template.user_id,
          workspace_id: template.workspace_id || null,
          template_name: template.template_name.toLowerCase().replace(/\s+/g, "_"),
          template_language: template.template_language || "en",
          category: template.category || "MARKETING",
          status: "draft",
          header_type: template.header_type || null,
          header_content: template.header_content || null,
          body_text: template.body_text,
          footer_text: template.footer_text || null,
          buttons: template.buttons || [],
          sample_values: template.sample_values || {},
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,template_name,template_language" })
        .select()
        .single();

      if (error) throw error;
      return jsonRes({ ok: true, template: data });
    }

    // === SUBMIT TO META FOR APPROVAL ===
    if (action === "submit") {
      if (!template_id) return jsonRes({ error: "template_id required" }, 400);

      const { data: tmpl, error: tmplErr } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("id", template_id)
        .single();

      if (tmplErr || !tmpl) return jsonRes({ error: "Template not found" }, 404);

      // Get WA credentials from channel settings
      const credentials = await getWACredentials(supabase, tmpl.user_id);
      if (!credentials) return jsonRes({ error: "WhatsApp not configured. Connect your WhatsApp Business Account first." }, 400);

      // Build Meta template components
      const components: any[] = [];

      if (tmpl.header_type && tmpl.header_type !== "NONE" && tmpl.header_content) {
        if (tmpl.header_type === "TEXT") {
          components.push({ type: "HEADER", format: "TEXT", text: tmpl.header_content });
        } else {
          components.push({ type: "HEADER", format: tmpl.header_type, example: { header_handle: [tmpl.header_content] } });
        }
      }

      components.push({
        type: "BODY",
        text: tmpl.body_text,
        ...(Object.keys(tmpl.sample_values || {}).length > 0
          ? { example: { body_text: [Object.values(tmpl.sample_values)] } }
          : {}),
      });

      if (tmpl.footer_text) {
        components.push({ type: "FOOTER", text: tmpl.footer_text });
      }

      if (Array.isArray(tmpl.buttons) && tmpl.buttons.length > 0) {
        components.push({ type: "BUTTONS", buttons: tmpl.buttons });
      }

      // Submit to Meta Graph API
      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${credentials.waba_id}/message_templates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: tmpl.template_name,
            language: tmpl.template_language,
            category: tmpl.category,
            components,
          }),
        },
      );

      const metaData = await metaRes.json();

      if (!metaRes.ok) {
        const errorMsg = metaData?.error?.message || "Meta API error";
        await supabase
          .from("whatsapp_templates")
          .update({ status: "rejected", rejection_reason: errorMsg, updated_at: new Date().toISOString() } as any)
          .eq("id", template_id);

        return jsonRes({ error: errorMsg, meta_error: metaData?.error }, metaRes.status);
      }

      // Update with Meta template ID
      await supabase
        .from("whatsapp_templates")
        .update({
          status: "pending",
          meta_template_id: metaData.id,
          submitted_at: new Date().toISOString(),
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", template_id);

      return jsonRes({ ok: true, meta_template_id: metaData.id, status: metaData.status });
    }

    // === SYNC TEMPLATE STATUSES FROM META ===
    if (action === "sync") {
      if (!user_id) return jsonRes({ error: "user_id required" }, 400);

      const credentials = await getWACredentials(supabase, user_id);
      if (!credentials) return jsonRes({ error: "WhatsApp not configured" }, 400);

      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${credentials.waba_id}/message_templates?limit=100`,
        { headers: { Authorization: `Bearer ${credentials.access_token}` } },
      );

      if (!metaRes.ok) {
        return jsonRes({ error: "Failed to fetch templates from Meta" }, metaRes.status);
      }

      const metaData = await metaRes.json();
      let synced = 0;

      for (const mt of metaData.data || []) {
        const metaStatus = mt.status?.toLowerCase();
        const localStatus = metaStatus === "approved" ? "approved"
          : metaStatus === "rejected" ? "rejected"
          : metaStatus === "paused" ? "paused"
          : metaStatus === "disabled" ? "disabled"
          : "pending";

        const { error } = await supabase
          .from("whatsapp_templates")
          .update({
            status: localStatus,
            meta_template_id: mt.id,
            rejection_reason: mt.quality_score?.reasons?.join(", ") || null,
            approved_at: localStatus === "approved" ? new Date().toISOString() : null,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any)
          .eq("user_id", user_id)
          .eq("template_name", mt.name)
          .eq("template_language", mt.language);

        if (!error) synced++;
      }

      return jsonRes({ ok: true, synced, total_from_meta: metaData.data?.length || 0 });
    }

    // === DELETE TEMPLATE ===
    if (action === "delete") {
      if (!template_id) return jsonRes({ error: "template_id required" }, 400);

      const { data: tmpl } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("id", template_id)
        .single();

      if (tmpl?.meta_template_id) {
        const credentials = await getWACredentials(supabase, tmpl.user_id);
        if (credentials) {
          await fetch(
            `https://graph.facebook.com/v19.0/${credentials.waba_id}/message_templates?name=${tmpl.template_name}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${credentials.access_token}` } },
          ).catch(() => {});
        }
      }

      await supabase.from("whatsapp_templates").delete().eq("id", template_id);
      return jsonRes({ ok: true });
    }

    return jsonRes({ error: "Invalid action. Use: create, submit, sync, delete" }, 400);
  } catch (e) {
    console.error("[WA-TEMPLATES] Error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function getWACredentials(supabase: any, userId: string) {
  const { data: channels } = await supabase
    .from("channels")
    .select("settings")
    .eq("user_id", userId)
    .eq("channel_type", "whatsapp")
    .eq("is_enabled", true)
    .limit(1);

  const settings = channels?.[0]?.settings as Record<string, any> | null;
  if (!settings?.access_token || !settings?.waba_id) return null;

  return {
    access_token: settings.access_token,
    waba_id: settings.waba_id,
    phone_number_id: settings.phone_number_id,
  };
}

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json",
    },
  });
}
