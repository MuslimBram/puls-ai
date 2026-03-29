import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_RETRIES = 2;
const TIMEOUT_MS = 15_000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Parse and validate body
    const body = await req.json();
    const { adapter_key, message_content, recipient_identifier, metadata, idempotency_key } = body;

    if (!adapter_key || !message_content || !recipient_identifier) {
      return json({ error: "Missing required fields: adapter_key, message_content, recipient_identifier" }, 400);
    }

    // --- Idempotency check ---
    const dedupeKey = idempotency_key
      ? `outbound:${adapter_key}:${idempotency_key}`
      : null;

    if (dedupeKey) {
      const { data: existing } = await supabaseAdmin
        .from("integration_event_logs")
        .select("id, status, metadata")
        .eq("idempotency_key", dedupeKey)
        .maybeSingle();

      if (existing) {
        return json({ success: existing.status === "success", duplicate: true, message: "Already processed" });
      }
    }

    // Look up adapter
    const { data: adapter, error: adapterErr } = await supabaseAdmin
      .from("custom_channel_adapters")
      .select("*")
      .eq("adapter_key", adapter_key)
      .eq("is_active", true)
      .single();

    if (adapterErr || !adapter) return json({ error: "Adapter not found or inactive" }, 404);
    if (!adapter.provider_api_url) return json({ error: "Adapter has no provider API URL configured" }, 400);

    // Apply outbound_mapping
    const outMapping = adapter.outbound_mapping || {};
    const providerPayload: Record<string, unknown> = {};
    const pulseData: Record<string, unknown> = { message_content, recipient_identifier, ...(metadata || {}) };

    for (const [pulseField, providerField] of Object.entries(outMapping)) {
      if (typeof providerField === "string" && pulseData[pulseField] !== undefined) {
        providerPayload[providerField] = pulseData[pulseField];
      }
    }

    // Fallback if mapping produced nothing
    if (Object.keys(providerPayload).length === 0) {
      providerPayload.text = message_content;
      providerPayload.to = recipient_identifier;
    }

    // Build provider auth headers
    const providerHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const creds = adapter.auth_credentials || {};

    switch (adapter.auth_type) {
      case "bearer":
        if (creds.token) providerHeaders["Authorization"] = `Bearer ${creds.token}`;
        break;
      case "basic":
        if (creds.username && creds.password) {
          providerHeaders["Authorization"] = `Basic ${btoa(`${creds.username}:${creds.password}`)}`;
        }
        break;
      case "api_key":
        if (creds.header_name && creds.api_key) {
          providerHeaders[creds.header_name] = creds.api_key;
        }
        break;
    }

    // Send to provider with retry + timeout
    let providerStatus = 0;
    let providerBody: unknown = null;
    let lastError = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const providerRes = await fetch(adapter.provider_api_url, {
          method: "POST",
          headers: providerHeaders,
          body: JSON.stringify(providerPayload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        providerStatus = providerRes.status;
        providerBody = await providerRes.text();
        try { providerBody = JSON.parse(providerBody as string); } catch { /* keep as text */ }

        // Don't retry on 4xx (client errors)
        if (providerStatus >= 400 && providerStatus < 500) break;
        // Success
        if (providerStatus >= 200 && providerStatus < 300) break;
        // 5xx — retry
        lastError = `Provider returned ${providerStatus}`;
      } catch (fetchErr) {
        lastError = fetchErr instanceof Error ? fetchErr.message : "Fetch failed";
        providerBody = { error: lastError };
        providerStatus = 0;
      }

      // Wait before retry (simple backoff)
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    const success = providerStatus >= 200 && providerStatus < 300;

    // Log event
    try {
      await supabaseAdmin.from("integration_event_logs").insert({
        integration_id: adapter.id,
        adapter_key: adapter_key,
        event_type: "outbound_message",
        event_message: `outbound to ${recipient_identifier}: ${success ? "success" : "failed"}`,
        payload: { recipient_identifier, message_content, provider_response: providerBody },
        status: success ? "success" : "failed",
        idempotency_key: dedupeKey,
        metadata: { provider_status: providerStatus, sent_by: userId, last_error: lastError || undefined },
      });
    } catch (e) {
      console.error("[custom-channel-send] Log error:", e);
    }

    return json({
      success,
      provider_status: providerStatus,
      provider_response: providerBody,
      adapter: adapter_key,
      ...(lastError && !success ? { error: lastError } : {}),
    }, success ? 200 : 502);
  } catch (error) {
    console.error("[custom-channel-send] Error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
