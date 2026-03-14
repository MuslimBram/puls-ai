import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Placeholder edge function for external integration webhooks.
 * Routes: POST /integration-webhook?adapter=manychat|whatsapp_analytics|...
 *
 * This function will:
 * 1. Validate the adapter key
 * 2. Check rate limits (min 30min scan interval)
 * 3. Log the event to integration_event_logs
 * 4. Forward normalized data to inbox_messages / leads (future)
 *
 * NO production logic implemented yet.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const adapter = url.searchParams.get("adapter");

    if (!adapter) {
      return new Response(
        JSON.stringify({ error: "Missing 'adapter' query parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Placeholder response — no processing yet
    console.log(`[integration-webhook] Received event for adapter: ${adapter}`, JSON.stringify(body).slice(0, 500));

    return new Response(
      JSON.stringify({
        success: true,
        adapter,
        message: "Webhook received (placeholder — no processing yet)",
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[integration-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
