import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { getServiceKey } from "./admin-client.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTACHMENT_KEY_RE = /^[A-Za-z0-9:_-]{1,200}$/;

export type StageInboundAttachmentInput = {
  workspace_id: string;
  source: string;
  event_id: string;
  attachment_key: string;
  expected_attachment_count: number;
  bytes: Uint8Array;
  mime_type: string;
};

export type StageInboundAttachmentResult =
  | { ok: true; reused: boolean; scan_id: string }
  | { ok: false; retryable: boolean; code: string; status: number };

/**
 * Stages already-downloaded provider bytes only after the firewall has produced
 * a completed quarantine decision. The logical event id never substitutes for
 * the database security-event UUID; this helper resolves the canonical parent
 * row server-side before calling the raw-byte staging boundary.
 */
export async function stageInboundAttachment(
  input: StageInboundAttachmentInput,
): Promise<StageInboundAttachmentResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "";
  const serviceKey = getServiceKey();

  if (!supabaseUrl || !internalSecret || !serviceKey) {
    return { ok: false, retryable: true, code: "ATTACHMENT_STAGING_NOT_CONFIGURED", status: 503 };
  }
  if (!UUID_RE.test(input.workspace_id)
      || !input.source
      || !input.event_id
      || !ATTACHMENT_KEY_RE.test(input.attachment_key)
      || !Number.isInteger(input.expected_attachment_count)
      || input.expected_attachment_count < 1
      || input.expected_attachment_count > 50) {
    return { ok: false, retryable: false, code: "INVALID_ATTACHMENT_STAGE_BINDING", status: 400 };
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: parent, error: parentError } = await admin
    .from("content_security_events")
    .select("id")
    .eq("workspace_id", input.workspace_id)
    .eq("source", input.source)
    .eq("event_id", input.event_id)
    .eq("processing_status", "completed")
    .eq("action", "quarantine")
    .maybeSingle();

  if (parentError) {
    return { ok: false, retryable: true, code: "SECURITY_EVENT_LOOKUP_FAILED", status: 503 };
  }
  if (!parent?.id || !UUID_RE.test(String(parent.id))) {
    return { ok: false, retryable: true, code: "SECURITY_QUARANTINE_PARENT_MISSING", status: 409 };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/content-security-attachment-stage`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        "x-internal-secret": internalSecret,
        "x-workspace-id": input.workspace_id,
        "x-security-event-id": String(parent.id),
        "x-attachment-key": input.attachment_key,
        "x-expected-attachment-count": String(input.expected_attachment_count),
        "Content-Type": input.mime_type || "application/octet-stream",
        "Content-Length": String(input.bytes.byteLength),
      },
      body: input.bytes,
    });
  } catch {
    return { ok: false, retryable: true, code: "ATTACHMENT_STAGE_UNAVAILABLE", status: 503 };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    // Fail closed below without exposing raw response text.
  }

  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : "ATTACHMENT_STAGE_FAILED";
    return {
      ok: false,
      retryable: response.status === 409 || response.status >= 500,
      code,
      status: response.status,
    };
  }

  if (payload.ok !== true || typeof payload.scan_id !== "string" || !UUID_RE.test(payload.scan_id)) {
    return { ok: false, retryable: true, code: "ATTACHMENT_STAGE_INVALID_RESPONSE", status: 502 };
  }

  return { ok: true, reused: payload.reused === true, scan_id: payload.scan_id };
}
