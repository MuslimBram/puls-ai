import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // GET: Test verification endpoint
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      const verifyToken = Deno.env.get("META_VERIFY_TOKEN");

      // Log the verification attempt
      await supabase.from("webhook_activity_logs").insert({
        event_type: "verification_attempt",
        source: "meta_test",
        method: "GET",
        endpoint: "/meta-webhook-test",
        payload_preview: JSON.stringify({ mode, token: token ? "***" : null, challenge }),
        status: mode === "subscribe" && token === verifyToken ? "processed" : "failed",
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      });

      if (mode === "subscribe" && token === verifyToken) {
        return new Response(challenge, { status: 200 });
      }

      return new Response(JSON.stringify({
        ok: false,
        error: "Verification failed",
        hint: "Check that META_VERIFY_TOKEN is set and matches the token in your webhook config",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: Simulate incoming Meta webhook payload
    const body = await req.json();
    const startTime = Date.now();

    // Validate structure
    const objectType = body?.object;
    const entries = body?.entry || [];

    if (!objectType || !["instagram", "page"].includes(objectType)) {
      await supabase.from("webhook_activity_logs").insert({
        event_type: "test_payload",
        source: "meta_test",
        method: "POST",
        endpoint: "/meta-webhook-test",
        payload_preview: JSON.stringify(body).slice(0, 500),
        status: "failed",
        error_message: "Invalid object type. Must be 'instagram' or 'page'.",
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      });

      return new Response(JSON.stringify({
        ok: false,
        error: "Invalid payload",
        hint: "Payload must have 'object' field set to 'instagram' or 'page'",
        expected_format: {
          object: "instagram",
          entry: [{
            id: "PAGE_OR_ACCOUNT_ID",
            messaging: [{
              sender: { id: "SENDER_ID" },
              message: { text: "Hello" },
              timestamp: Date.now(),
            }],
          }],
        },
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for duplicate webhook setup
    const pageIds = entries.map((e: any) => e.id).filter(Boolean);
    const duplicateChecks: any[] = [];

    for (const pageId of pageIds) {
      const { data: existing } = await supabase
        .from("channels")
        .select("id, channel_name, channel_type, settings")
        .eq("channel_type", objectType === "instagram" ? "instagram" : "facebook")
        .eq("is_enabled", true);

      const duplicate = (existing || []).find((ch: any) => {
        const s = ch.settings as Record<string, any> | null;
        return s?.page_id === pageId || s?.instagram_account_id === pageId;
      });

      if (duplicate) {
        duplicateChecks.push({
          page_id: pageId,
          is_duplicate: true,
          existing_channel: duplicate.channel_name,
          existing_channel_id: duplicate.id,
        });
      } else {
        duplicateChecks.push({
          page_id: pageId,
          is_duplicate: false,
        });
      }
    }

    // Count messages
    let messageCount = 0;
    for (const entry of entries) {
      messageCount += (entry.messaging || []).filter((e: any) => e.message).length;
    }

    const processingTime = Date.now() - startTime;

    // Log the test
    await supabase.from("webhook_activity_logs").insert({
      event_type: "test_payload",
      source: "meta_test",
      method: "POST",
      endpoint: "/meta-webhook-test",
      payload_preview: JSON.stringify(body).slice(0, 500),
      status: "processed",
      processing_time_ms: processingTime,
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      metadata: { object_type: objectType, entry_count: entries.length, message_count: messageCount, duplicate_checks: duplicateChecks },
    });

    return new Response(JSON.stringify({
      ok: true,
      test_results: {
        object_type: objectType,
        entries_count: entries.length,
        messages_found: messageCount,
        duplicate_checks: duplicateChecks,
        processing_time_ms: processingTime,
        verify_token_configured: !!Deno.env.get("META_VERIFY_TOKEN"),
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[META-WEBHOOK-TEST] Error:", e);
    return new Response(JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
