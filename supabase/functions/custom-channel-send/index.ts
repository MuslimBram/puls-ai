import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;

    // Parse body
    const body = await req.json();
    const { adapter_key, message_content, recipient_identifier, metadata } = body;

    if (!adapter_key || !message_content || !recipient_identifier) {
      return new Response(JSON.stringify({ error: "Missing required fields: adapter_key, message_content, recipient_identifier" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for adapter lookup
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up adapter
    const { data: adapter, error: adapterErr } = await supabaseAdmin
      .from("custom_channel_adapters")
      .select("*")
      .eq("adapter_key", adapter_key)
      .eq("is_active", true)
      .single();

    if (adapterErr || !adapter) {
      return new Response(JSON.stringify({ error: "Adapter not found or inactive" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!adapter.provider_api_url) {
      return new Response(JSON.stringify({ error: "Adapter has no provider API URL configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply outbound_mapping
    const outMapping = adapter.outbound_mapping || {};
    const providerPayload: Record<string, unknown> = {};

    const pulseData: Record<string, unknown> = {
      message_content,
      recipient_identifier,
      ...(metadata || {}),
    };

    for (const [pulseField, providerField] of Object.entries(outMapping)) {
      if (typeof providerField === "string" && pulseData[pulseField] !== undefined) {
        providerPayload[providerField] = pulseData[pulseField];
      }
    }

    // If no mapping produced results, send raw
    if (Object.keys(providerPayload).length === 0) {
      providerPayload.text = message_content;
      providerPayload.to = recipient_identifier;
    }

    // Build auth headers for provider
    const providerHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const creds = adapter.auth_credentials || {};
    switch (adapter.auth_type) {
      case "bearer":
        if (creds.token) providerHeaders["Authorization"] = `Bearer ${creds.token}`;
        break;
      case "basic":
        if (creds.username && creds.password) {
          const encoded = btoa(`${creds.username}:${creds.password}`);
          providerHeaders["Authorization"] = `Basic ${encoded}`;
        }
        break;
      case "api_key":
        if (creds.header_name && creds.api_key) {
          providerHeaders[creds.header_name] = creds.api_key;
        }
        break;
    }

    // Send to provider
    let providerStatus = 0;
    let providerBody: unknown = null;
    try {
      const providerRes = await fetch(adapter.provider_api_url, {
        method: "POST",
        headers: providerHeaders,
        body: JSON.stringify(providerPayload),
      });
      providerStatus = providerRes.status;
      providerBody = await providerRes.json().catch(() => providerRes.statusText);
    } catch (fetchErr) {
      providerBody = { error: fetchErr instanceof Error ? fetchErr.message : "Fetch failed" };
      providerStatus = 0;
    }

    const success = providerStatus >= 200 && providerStatus < 300;

    // Log event
    await supabaseAdmin.from("integration_event_logs").insert({
      integration_id: adapter.id,
      event_type: "outbound_message",
      payload: { recipient_identifier, message_content, provider_response: providerBody },
      status: success ? "success" : "failed",
      metadata: { adapter_key, provider_status: providerStatus, sent_by: userId },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success,
        provider_status: providerStatus,
        provider_response: providerBody,
        adapter: adapter_key,
      }),
      { status: success ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[custom-channel-send] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
