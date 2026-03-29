import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const adapterKey = url.searchParams.get("adapter");

    if (!adapterKey) {
      return new Response(
        JSON.stringify({ error: "Missing 'adapter' query parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up adapter
    const { data: adapter, error: adapterErr } = await supabaseAdmin
      .from("custom_channel_adapters")
      .select("*")
      .eq("adapter_key", adapterKey)
      .eq("is_active", true)
      .single();

    if (adapterErr || !adapter) {
      return new Response(
        JSON.stringify({ error: "Adapter not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    console.log(`[integration-webhook] adapter=${adapterKey}`, JSON.stringify(body).slice(0, 500));

    // Apply inbound_mapping: maps provider fields → Pulse fields
    const mapping = adapter.inbound_mapping || {};
    const normalized: Record<string, string> = {};

    for (const [providerField, pulseField] of Object.entries(mapping)) {
      if (typeof pulseField === "string" && body[providerField] !== undefined) {
        normalized[pulseField] = String(body[providerField]);
      }
    }

    const senderName = normalized.sender_name || body.sender_name || body.from || "Unknown";
    const messageContent = normalized.message_content || body.message_content || body.text || body.message || "";
    const senderIdentifier = normalized.sender_identifier || body.sender_identifier || body.sender_id || body.from || "unknown";
    const channelType = normalized.channel_type || body.channel_type || "custom";

    if (!messageContent) {
      return new Response(
        JSON.stringify({ error: "No message content found after mapping" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get workspace owner as user_id
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("owner_id")
      .eq("id", adapter.workspace_id)
      .single();

    if (!workspace) {
      return new Response(
        JSON.stringify({ error: "Workspace not found for adapter" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = workspace.owner_id;

    // Upsert conversation thread
    const { data: threadId } = await supabaseAdmin.rpc("upsert_conversation_thread", {
      _user_id: userId,
      _channel_type: channelType,
      _contact_identifier: senderIdentifier,
      _contact_name: senderName,
      _message_preview: messageContent,
      _direction: "inbound",
    });

    // Insert into inbox_messages
    const { data: msg, error: msgErr } = await supabaseAdmin
      .from("inbox_messages")
      .insert({
        user_id: userId,
        source_name: `custom:${adapterKey}`,
        message_content: messageContent,
        sender_name: senderName,
        sender_identifier: senderIdentifier,
        channel_type: channelType,
        direction: "inbound",
        thread_id: threadId || null,
        is_unread: true,
      })
      .select("id")
      .single();

    if (msgErr) {
      console.error("[integration-webhook] Insert error:", msgErr);
      return new Response(
        JSON.stringify({ error: "Failed to store message", detail: msgErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log event
    await supabaseAdmin.from("integration_event_logs").insert({
      integration_id: adapter.id,
      event_type: "inbound_message",
      payload: body,
      status: "success",
      metadata: { adapter_key: adapterKey, message_id: msg?.id },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        adapter: adapterKey,
        message_id: msg?.id,
        thread_id: threadId,
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
