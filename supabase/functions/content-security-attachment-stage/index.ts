import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { getServiceKey } from "../_shared/admin-client.ts";

const BUCKET = "content-security-quarantine";
const MAX_STAGE_BYTES = 25 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTACHMENT_KEY_RE = /^[A-Za-z0-9:_-]{1,200}$/;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(req: Request): boolean {
  const serviceKey = getServiceKey();
  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "";
  return safeEqual(req.headers.get("apikey") ?? "", serviceKey)
    && safeEqual(req.headers.get("x-internal-secret") ?? "", internalSecret);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedMime(req: Request): string {
  const raw = (req.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
  return raw && raw.length <= 160 ? raw : "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !authorized(req)) {
    return json({ error: "INTERNAL_SERVICE_ONLY" }, 403);
  }

  const workspaceId = (req.headers.get("x-workspace-id") ?? "").trim();
  const securityEventId = (req.headers.get("x-security-event-id") ?? "").trim();
  const attachmentKey = (req.headers.get("x-attachment-key") ?? "").trim();
  const expectedCount = Number(req.headers.get("x-expected-attachment-count") ?? "");
  const mimeType = normalizedMime(req);

  if (!UUID_RE.test(workspaceId) || !UUID_RE.test(securityEventId)) {
    return json({ error: "INVALID_SECURITY_BINDING" }, 400);
  }
  if (!ATTACHMENT_KEY_RE.test(attachmentKey)) {
    return json({ error: "INVALID_ATTACHMENT_KEY" }, 400);
  }
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 50) {
    return json({ error: "INVALID_EXPECTED_ATTACHMENT_COUNT" }, 400);
  }

  const declaredLength = req.headers.get("content-length");
  if (declaredLength) {
    const declaredBytes = Number(declaredLength);
    if (!Number.isInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > MAX_STAGE_BYTES) {
      return json({ error: "ATTACHMENT_STAGE_SIZE_LIMIT" }, 413);
    }
  }

  const serviceKey = getServiceKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!serviceKey || !supabaseUrl) return json({ error: "STAGING_NOT_CONFIGURED" }, 503);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: parent, error: parentError } = await admin
    .from("content_security_events")
    .select("id,workspace_id,processing_status,action,expected_attachment_count")
    .eq("id", securityEventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (parentError || !parent || parent.processing_status !== "completed" || parent.action !== "quarantine") {
    return json({ error: "MALWARE_PARENT_SECURITY_EVENT_INVALID" }, 403);
  }
  if (parent.expected_attachment_count !== null
      && Number(parent.expected_attachment_count) !== expectedCount) {
    return json({ error: "MALWARE_EXPECTED_ATTACHMENT_COUNT_MISMATCH" }, 409);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return json({ error: "ATTACHMENT_BODY_UNREADABLE" }, 400);
  }
  if (bytes.byteLength > MAX_STAGE_BYTES) {
    return json({ error: "ATTACHMENT_STAGE_SIZE_LIMIT" }, 413);
  }

  const contentSha256 = await sha256Hex(bytes);

  const { data: existing, error: existingError } = await admin
    .from("content_security_attachment_scans")
    .select("id,content_sha256,byte_size,mime_type,status")
    .eq("security_event_id", securityEventId)
    .eq("attachment_key", attachmentKey)
    .maybeSingle();
  if (existingError) return json({ error: "ATTACHMENT_STAGE_LOOKUP_FAILED" }, 503);

  if (existing) {
    const same = existing.content_sha256 === contentSha256
      && Number(existing.byte_size) === bytes.byteLength
      && (existing.mime_type ?? "application/octet-stream") === mimeType;
    if (!same) return json({ error: "MALWARE_SCAN_PAYLOAD_MISMATCH" }, 409);
    return json({
      ok: true,
      reused: true,
      scan_id: existing.id,
      attachment_key: attachmentKey,
      status: existing.status,
      content_sha256: contentSha256,
      byte_size: bytes.byteLength,
    });
  }

  const objectPath = `${workspaceId}/${securityEventId}/${crypto.randomUUID()}`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: mimeType,
    upsert: false,
    cacheControl: "0",
  });
  if (uploadError) {
    console.error("[ATTACHMENT-STAGE] private upload failed", uploadError.message);
    return json({ error: "ATTACHMENT_PRIVATE_UPLOAD_FAILED" }, 503);
  }

  const removeUploadedObject = async () => {
    const { error } = await admin.storage.from(BUCKET).remove([objectPath]);
    if (error) console.error("[ATTACHMENT-STAGE] cleanup failed", error.message);
  };

  const { data: enqueued, error: enqueueError } = await admin.rpc("enqueue_content_security_attachment_scan", {
    p_security_event_id: securityEventId,
    p_workspace_id: workspaceId,
    p_attachment_key: attachmentKey,
    p_expected_attachment_count: expectedCount,
    p_object_path: objectPath,
    p_content_sha256: contentSha256,
    p_byte_size: bytes.byteLength,
    p_mime_type: mimeType,
  });

  if (enqueueError || !enqueued?.enqueued) {
    // Resolve a concurrent winner before failing. Count binding is checked first:
    // same file bytes can never make a retry with a different declared total valid.
    const [{ data: winner }, { data: reboundParent }] = await Promise.all([
      admin
        .from("content_security_attachment_scans")
        .select("id,content_sha256,byte_size,mime_type,status")
        .eq("security_event_id", securityEventId)
        .eq("attachment_key", attachmentKey)
        .maybeSingle(),
      admin
        .from("content_security_events")
        .select("expected_attachment_count")
        .eq("id", securityEventId)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);

    await removeUploadedObject();

    if (reboundParent?.expected_attachment_count !== null
        && Number(reboundParent?.expected_attachment_count) !== expectedCount) {
      return json({ error: "MALWARE_EXPECTED_ATTACHMENT_COUNT_MISMATCH" }, 409);
    }

    const sameWinner = winner
      && winner.content_sha256 === contentSha256
      && Number(winner.byte_size) === bytes.byteLength
      && (winner.mime_type ?? "application/octet-stream") === mimeType;
    if (sameWinner) {
      return json({
        ok: true,
        reused: true,
        scan_id: winner.id,
        attachment_key: attachmentKey,
        status: winner.status,
        content_sha256: contentSha256,
        byte_size: bytes.byteLength,
      });
    }

    return json({ error: "ATTACHMENT_SCAN_ENQUEUE_FAILED" }, 503);
  }

  return json({
    ok: true,
    reused: Boolean(enqueued.reused),
    scan_id: enqueued.scan_id,
    attachment_key: attachmentKey,
    expected_attachment_count: expectedCount,
    content_sha256: contentSha256,
    byte_size: bytes.byteLength,
  });
});
