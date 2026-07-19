import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const adapterKey = url.searchParams.get("adapter");

    if (!adapterKey) return json(req, { error: "Missing 'adapter' query parameter" }, 400);

    // Look up adapter
    const { data: adapter, error: adapterErr } = await supabaseAdmin
      .from("custom_channel_adapters")
      .select("*")
      .eq("adapter_key", adapterKey)
      .eq("is_active", true)
      .single();

    if (adapterErr || !adapter) return json(req, { error: "Adapter not found or inactive" }, 404);

    // Parse body with size guard
    const rawBody = await req.text();
    if (rawBody.length > 256_000) return json(req, { error: "Payload too large" }, 413);

    // --- Adapter credential verification ---
    const authType = (adapter as any).auth_type as string | null | undefined;
    const authCreds = ((adapter as any).auth_credentials || {}) as Record<string, any>;
    if (authType && authType !== "none") {
      if (authType === "api_key") {
        const expectedKey = authCreds.api_key || authCreds.token;
        const incomingKey =
          req.headers.get("x-api-key") ||
          req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          "";
        if (!expectedKey || incomingKey !== expectedKey) {
          return json(req, { error: "Unauthorized" }, 401);
        }
      } else if (authType === "hmac") {
        const secret = authCreds.secret;
        const header =
          req.headers.get("x-signature-256") ||
          req.headers.get("x-hub-signature-256") ||
          req.headers.get("x-signature") ||
          "";
        if (!secret || !header) return json(req, { error: "Unauthorized" }, 401);
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
        const bytes = new Uint8Array(mac);
        let hex = "";
        for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
        const expected = header.startsWith("sha256=") ? header.slice(7) : header;
        if (expected.toLowerCase() !== hex) return json(req, { error: "Unauthorized" }, 401);
      } else if (authType === "basic") {
        const expected = authCreds.authorization || authCreds.header;
        const incoming = req.headers.get("authorization") || "";
        if (!expected || incoming !== expected) return json(req, { error: "Unauthorized" }, 401);
      } else {
        // Unknown auth type — fail closed
        return json(req, { error: "Unsupported auth_type" }, 401);
      }
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(req, { error: "Invalid JSON body" }, 400);
    }

    console.log(`[integration-webhook] adapter=${adapterKey}`, rawBody.slice(0, 500));

    // --- Idempotency check ---
    // Use provider-sent ID or hash of body to prevent duplicate processing
    const providerId = String(
      body.message_id || body.id || body.event_id || body.webhook_id || "",
    );
    const idempotencyKey = providerId
      ? `inbound:${adapterKey}:${providerId}`
      : `inbound:${adapterKey}:${hashBody(rawBody)}`;

    const { data: existingLog } = await supabaseAdmin
      .from("integration_event_logs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingLog) {
      return json(req, { success: true, duplicate: true, message: "Already processed" }, 200);
    }

    // Apply inbound_mapping: maps provider fields → Pulse fields
    const mapping = adapter.inbound_mapping || {};
    const normalized: Record<string, string> = {};

    for (const [providerField, pulseField] of Object.entries(mapping)) {
      if (typeof pulseField === "string" && body[providerField] !== undefined) {
        normalized[pulseField] = String(body[providerField]);
      }
    }

    const senderName = normalized.sender_name || String(body.sender_name || body.from || "Unknown");
    const messageContent = normalized.message_content || String(body.message_content || body.text || body.message || "");
    const senderIdentifier = normalized.sender_identifier || String(body.sender_identifier || body.sender_id || body.from || "unknown");
    const channelType = normalized.channel_type || String(body.channel_type || "custom");

    if (!messageContent) return json(req, { error: "No message content found after mapping" }, 400);

    // Get workspace owner as user_id
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("owner_id")
      .eq("id", adapter.workspace_id)
      .single();

    if (!workspace) return json(req, { error: "Workspace not found for adapter" }, 500);

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
      // Log failure
      await logEvent(supabaseAdmin, adapter.id, adapterKey, "inbound_message", body, "failed", idempotencyKey, { error: msgErr.message });
      return json(req, { error: "Failed to store message", detail: msgErr.message }, 500);
    }

    // Log success
    await logEvent(supabaseAdmin, adapter.id, adapterKey, "inbound_message", body, "success", idempotencyKey, { message_id: msg?.id, thread_id: threadId });

    return json(req, {
      success: true,
      adapter: adapterKey,
      message_id: msg?.id,
      thread_id: threadId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[integration-webhook] Error:", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

async function logEvent(
  client: ReturnType<typeof createClient>,
  integrationId: string,
  adapterKey: string,
  eventType: string,
  payload: unknown,
  status: string,
  idempotencyKey: string,
  metadata: Record<string, unknown>,
) {
  try {
    await client.from("integration_event_logs").insert({
      integration_id: integrationId,
      adapter_key: adapterKey,
      event_type: eventType,
      event_message: `${eventType} via ${adapterKey}: ${status}`,
      payload,
      status,
      idempotency_key: idempotencyKey,
      metadata,
    });
  } catch (e) {
    console.error("[integration-webhook] Log error:", e);
  }
}

function hashBody(raw: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(raw.length, 2000); i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
