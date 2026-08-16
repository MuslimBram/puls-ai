import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

function hashBody(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    const url = new URL(req.url);
    const adapterKey = url.searchParams.get("adapter");

    if (!adapterKey) return json(req, { error: "Missing 'adapter' query parameter" }, 400);

    // READ RAW BODY BEFORE ANY JSON PARSING (Crucial for HMAC SHA-256 validation!)
    const rawBody = await req.text();
    if (rawBody.length > 256_000) return json(req, { error: "Payload too large" }, 413);

    // ── SPECIALIZED HANDLER FOR CAL.COM WEBHOOKS ──────────────────────────────
    if (adapterKey === "calcom") {
      const signatureHeader =
        req.headers.get("x-cal-signature-256") ||
        req.headers.get("x-signature-256") ||
        "";

      // If webhook_secret is configured, verify HMAC SHA-256 against rawBody
      const webhookSecret = Deno.env.get("CALCOM_WEBHOOK_SECRET");
      if (webhookSecret && signatureHeader) {
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(webhookSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
        const bytes = new Uint8Array(mac);
        let hex = "";
        for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
        const expected = signatureHeader.startsWith("sha256=")
          ? signatureHeader.slice(7)
          : signatureHeader;
        if (expected.toLowerCase() !== hex) {
          return json(req, { error: "Unauthorized: Invalid Cal.com HMAC signature" }, 401);
        }
      }

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return json(req, { error: "Invalid JSON body" }, 400);
      }

      const triggerEvent = (body.triggerEvent as string) ?? "BOOKING_CREATED";
      const payload = (body.payload as Record<string, unknown>) || body;
      const bookingUid = String(payload.bookingUid || payload.uid || payload.id || hashBody(rawBody));
      const workspaceId = (body.workspace_id as string) || url.searchParams.get("workspace_id");

      if (!workspaceId) {
        return json(req, { error: "workspace_id required for Cal.com webhook ingestion" }, 400);
      }

      const idempotencyKey = `inbound:calcom:${bookingUid}:${triggerEvent}`;

      // Idempotency Check
      const { data: existingLog } = await supabaseAdmin
        .from("integration_event_logs")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingLog) {
        return json(req, { success: true, duplicate: true, message: "Already processed" }, 200);
      }

      const attendees = payload.attendees as Array<{ name?: string; email?: string }> | undefined;
      const organizer = payload.organizer as { name?: string; email?: string } | undefined;
      const attendeeName = attendees?.[0]?.name || organizer?.name || "Cal.com Lead";
      const attendeeEmail = attendees?.[0]?.email || organizer?.email || "lead@cal.com";
      const startTime = String(payload.startTime || payload.start || new Date().toISOString());
      const title = String(payload.title || `Cal.com Booking (${bookingUid})`);

      // Process event types into CRM (lead_captures & deals)
      if (triggerEvent === "BOOKING_CREATED") {
        await supabaseAdmin.from("lead_captures").insert({
          workspace_id: workspaceId,
          email: attendeeEmail,
          name: attendeeName,
          lead_source: "calcom",
          notes: `Booking UID: ${bookingUid} - ${title}`,
        });

        await supabaseAdmin.from("deals").insert({
          workspace_id: workspaceId,
          title,
          stage: "scheduled",
          scheduled_at: startTime,
          metadata: { booking_uid: bookingUid, attendeeEmail, attendeeName },
        });
      } else if (triggerEvent === "BOOKING_RESCHEDULED") {
        await supabaseAdmin
          .from("deals")
          .update({
            scheduled_at: startTime,
            stage: "rescheduled",
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .contains("metadata", { booking_uid: bookingUid });
      } else if (triggerEvent === "BOOKING_CANCELLED") {
        await supabaseAdmin
          .from("deals")
          .update({
            stage: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .contains("metadata", { booking_uid: bookingUid });
      }

      await supabaseAdmin.from("integration_event_logs").insert({
        workspace_id: workspaceId,
        adapter_key: "calcom",
        event_type: triggerEvent,
        idempotency_key: idempotencyKey,
        status: "success",
        metadata: { booking_uid: bookingUid, triggerEvent, title, startTime },
      });

      return json(req, {
        success: true,
        adapter: "calcom",
        trigger_event: triggerEvent,
        booking_uid: bookingUid,
      });
    }

    // ── GENERIC ADAPTER PATH FOR OTHER CUSTOM INTEGRATIONS ────────────────────
    const { data: adapter, error: adapterErr } = await supabaseAdmin
      .from("custom_channel_adapters")
      .select("*")
      .eq("adapter_key", adapterKey)
      .eq("is_active", true)
      .single();

    if (adapterErr || !adapter) return json(req, { error: "Adapter not found or inactive" }, 404);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(req, { error: "Invalid JSON body" }, 400);
    }

    const providerId = String(body.message_id || body.id || body.event_id || body.webhook_id || "");
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

    await supabaseAdmin.from("integration_event_logs").insert({
      workspace_id: adapter.workspace_id,
      adapter_key: adapterKey,
      event_type: "inbound_webhook",
      idempotency_key: idempotencyKey,
      status: "success",
      metadata: body,
    });

    return json(req, { success: true, adapter: adapterKey, idempotency_key: idempotencyKey });
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
