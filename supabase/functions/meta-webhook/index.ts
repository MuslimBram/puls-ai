/**
 * meta-webhook — Instagram / Facebook Messenger events
 *
 * Ordering:
 * verified Meta signature -> exact page/account tenant resolution -> content security
 * -> provider claim -> idempotent Inbox/lead/canonical repairable side effects.
 * Quarantine/reject decisions never enter normal Inbox processing.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { verifyMetaSignature } from "../_shared/webhook-signatures.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { buildCanonicalEngagementEvent } from "../_shared/canonical-engagement-event.ts";
import { processInterestFromEngagementEventId } from "../_shared/social-interest-memory.ts";
import {
  blocksNormalIngress,
  extractSecurityUrls,
  scanInboundContent,
} from "../_shared/content-security-client.ts";
import { stageInboundAttachment } from "../_shared/content-security-attachment-client.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });
const rateLimitMap = new Map<string, { n: number; t: number }>();
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const encoder = new TextEncoder();

type WorkspaceMapping = { workspace_id: string; channel_id: string };
type MetaAttachment = { index: number; url: string; fallbackMime: string };
type DownloadedMetaAttachment = MetaAttachment & { bytes: Uint8Array; sha256: string; mimeType: string };

function checkRL(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.t) {
    rateLimitMap.set(key, { n: 1, t: now + 60_000 });
    return true;
  }
  if (entry.n >= 200) return false;
  entry.n++;
  return true;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(value: string): Promise<string> {
  return sha256Hex(encoder.encode(value));
}

function metaAttachmentMime(type: unknown): string {
  switch (String(type || "").toLowerCase()) {
    case "image": return "image/jpeg";
    case "audio": return "audio/mpeg";
    case "video": return "video/mp4";
    default: return "application/octet-stream";
  }
}

function allowedMetaCdnHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "fbcdn.net"
    || host.endsWith(".fbcdn.net")
    || host === "fbsbx.com"
    || host.endsWith(".fbsbx.com")
    || host === "cdninstagram.com"
    || host.endsWith(".cdninstagram.com");
}

function normalizeMetaAttachments(raw: unknown[]): MetaAttachment[] {
  if (raw.length > MAX_ATTACHMENTS) throw new Error("META_ATTACHMENT_COUNT_LIMIT");
  return raw.map((item, index) => {
    const attachment = item && typeof item === "object" ? item as Record<string, any> : {};
    const url = typeof attachment.payload?.url === "string" ? attachment.payload.url.trim() : "";
    if (!url) throw new Error("META_ATTACHMENT_URL_MISSING");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("META_ATTACHMENT_URL_INVALID");
    }
    if (parsed.protocol !== "https:" || !allowedMetaCdnHost(parsed.hostname)) {
      throw new Error("META_ATTACHMENT_HOST_REJECTED");
    }
    return { index, url: parsed.toString(), fallbackMime: metaAttachmentMime(attachment.type) };
  });
}

async function downloadMetaAttachment(attachment: MetaAttachment): Promise<DownloadedMetaAttachment> {
  const response = await fetch(attachment.url, { redirect: "error" });
  if (!response.ok) throw new Error("META_ATTACHMENT_DOWNLOAD_FAILED");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("META_ATTACHMENT_TOO_LARGE");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("META_ATTACHMENT_TOO_LARGE");
  const responseMime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return {
    ...attachment,
    bytes,
    sha256: await sha256Hex(bytes),
    mimeType: responseMime || attachment.fallbackMime,
  };
}

async function claimEvent(
  sb: ReturnType<typeof createClient>,
  provider: "meta_ig" | "meta_fb",
  eventId: string,
  workspaceId: string,
): Promise<"claimed" | "duplicate" | "error"> {
  const { error } = await sb.from("processed_webhook_events")
    .insert({ provider, event_id: `${provider}:${eventId}`, workspace_id: workspaceId });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  return "error";
}

async function resolveWorkspaceFromPage(
  sb: ReturnType<typeof createClient>,
  pageId: string,
  platform: "instagram" | "facebook",
): Promise<WorkspaceMapping | null | "AMBIGUOUS"> {
  const { data: channels, error } = await sb
    .from("channels")
    .select("id, workspace_id, settings")
    .in("channel_type", platform === "instagram" ? ["instagram"] : ["facebook", "messenger"])
    .eq("is_enabled", true);
  if (error) throw error;

  const matches: WorkspaceMapping[] = [];
  for (const channel of channels || []) {
    if (!channel.workspace_id) continue;
    const settings = (channel.settings as Record<string, unknown> | null) ?? {};
    const storedPageId = settings.page_id ?? settings.facebook_page_id ?? null;
    const storedAccountId = settings.instagram_account_id ?? settings.ig_account_id ?? null;
    if (storedPageId === pageId || storedAccountId === pageId) {
      matches.push({ workspace_id: channel.workspace_id, channel_id: channel.id });
    }
  }

  if (matches.length > 1) return "AMBIGUOUS";
  return matches[0] ?? null;
}

async function tryCanonicalInsert(
  sb: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    channelId: string;
    provider: "meta_ig" | "meta_fb";
    accountIdentifier: string;
    providerEventId: string;
    actorProviderId: string;
    content: string;
    timestamp?: number;
  },
): Promise<{ status: "inserted" | "duplicate" | "error"; id?: string }> {
  const canonicalEvent = buildCanonicalEngagementEvent({
    workspace_id:       params.workspaceId,
    channel_id:         params.channelId,
    provider:           params.provider,
    account_identifier: params.accountIdentifier,
    event_type:         "message_received",
    provider_event_id:  params.providerEventId,
    actor_provider_id:  params.actorProviderId,
    content_ref:        params.content,
    event_timestamp:    params.timestamp != null
      ? new Date(params.timestamp).toISOString()
      : new Date().toISOString(),
    normalized_metadata:    { page_id: params.accountIdentifier },
    consent_classification: "platform_terms",
  });

  const { data: inserted, error } = await sb.from("social_engagement_events").insert({
    workspace_id:           canonicalEvent.workspace_id,
    channel_id:             canonicalEvent.channel_id,
    provider:               canonicalEvent.provider,
    account_identifier:     canonicalEvent.account_identifier,
    event_type:             canonicalEvent.event_type,
    provider_event_id:      canonicalEvent.provider_event_id,
    actor_provider_id:      canonicalEvent.actor_provider_id,
    actor_identity_state:   canonicalEvent.actor_identity_state,
    is_anonymous_aggregate: canonicalEvent.is_anonymous_aggregate,
    content_ref:            canonicalEvent.content_ref,
    event_timestamp:        canonicalEvent.event_timestamp,
    normalized_metadata:    canonicalEvent.normalized_metadata,
    consent_classification: canonicalEvent.consent_classification,
    source_ref:             canonicalEvent.source_ref,
    idempotency_key:        canonicalEvent.idempotency_key,
  }).select("id").single();

  if (!error && inserted?.id) return { status: "inserted", id: inserted.id };
  if (error?.code === "23505") {
    const { data: existing, error: existErr } = await sb
      .from("social_engagement_events")
      .select("id")
      .eq("idempotency_key", canonicalEvent.idempotency_key)
      .limit(1)
      .maybeSingle();
    if (!existErr && existing?.id) return { status: "duplicate", id: existing.id };
  }
  return { status: "error" };
}

serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "meta";
  if (!checkRL(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  try {
    const rawBody = await req.text();
    const signature = await verifyMetaSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      "META_APP_SECRET",
    );
    if (!signature.ok) {
      const status = signature.reason === "secret_not_configured" ? 503 : 403;
      return new Response(JSON.stringify({ error: signature.reason }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(rawBody);
    const objectType = body?.object as string;
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let processed = 0;
    let quarantined = 0;

    for (const entry of entries) {
      const pageId = typeof entry?.id === "string" ? entry.id : "";
      if (!pageId) continue;

      const platform = objectType === "instagram"
        ? "instagram"
        : objectType === "page"
          ? "facebook"
          : null;
      if (!platform) continue;

      const ws = await resolveWorkspaceFromPage(sb, pageId, platform);
      if (ws === "AMBIGUOUS") {
        // quarantining: ambiguous workspace
        if (platform === "instagram") console.warn("[META-WEBHOOK] Ambiguous Instagram mapping for page", pageId);
        else console.warn("[META-WEBHOOK] Ambiguous Facebook mapping for page", pageId);
        quarantined++;
        continue;
      }
      if (!ws) { quarantined++; continue; }

      const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];

      for (const event of messaging) {
        const message = event?.message;
        if (!message) continue;

        const messageId = typeof message.mid === "string" ? message.mid.trim() : "";
        const senderId = typeof event?.sender?.id === "string" ? event.sender.id.trim() : "";
        if (!messageId || !senderId) { quarantined++; continue; }

        const text = typeof message.text === "string" ? message.text : "";
        const rawAttachments = Array.isArray(message.attachments) ? message.attachments : [];
        const content = text || (rawAttachments.length ? "[attachment]" : "");
        if (!content) continue;

        let downloadedAttachments: DownloadedMetaAttachment[] = [];
        if (rawAttachments.length > 0) {
          const attachments = normalizeMetaAttachments(rawAttachments);
          let totalBytes = 0;
          for (const attachment of attachments) {
            const downloaded = await downloadMetaAttachment(attachment);
            totalBytes += downloaded.bytes.byteLength;
            if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error("META_ATTACHMENTS_TOTAL_TOO_LARGE");
            downloadedAttachments.push(downloaded);
          }
        }

        let aggregateAttachment: { mime_type: string; size_bytes: number; sha256: string } | null = null;
        if (downloadedAttachments.length > 0) {
          const manifest = downloadedAttachments.map((a) => ({
            index: a.index,
            mime_type: a.mimeType,
            byte_size: a.bytes.byteLength,
            sha256: a.sha256,
          }));
          aggregateAttachment = {
            mime_type: downloadedAttachments.length === 1 ? downloadedAttachments[0].mimeType : "multipart/mixed",
            size_bytes: downloadedAttachments.reduce((sum, a) => sum + a.bytes.byteLength, 0),
            sha256: downloadedAttachments.length === 1
              ? downloadedAttachments[0].sha256
              : await sha256Text(JSON.stringify(manifest)),
          };
        }

        const provider = platform === "instagram" ? "meta_ig" as const : "meta_fb" as const;
        const securityEventId = `${platform === "instagram" ? "ig" : "fb"}:${messageId}`;

        const security = await scanInboundContent({
          workspace_id: ws.workspace_id,
          source: provider,
          event_id: securityEventId,
          content,
          urls: extractSecurityUrls(content),
          attachment: aggregateAttachment,
        });

        if (!security.ok) throw new Error("META_CONTENT_SECURITY_UNAVAILABLE");

        if (blocksNormalIngress(security.decision)) {
          if (downloadedAttachments.length > 0 && security.decision.action === "quarantine") {
            for (const attachment of downloadedAttachments) {
              const staged = await stageInboundAttachment({
                workspace_id: ws.workspace_id,
                source: provider,
                event_id: securityEventId,
                attachment_key: `meta_media_${attachment.index}`,
                expected_attachment_count: downloadedAttachments.length,
                bytes: attachment.bytes,
                mime_type: attachment.mimeType,
              });
              if (!staged.ok) throw new Error(`META_ATTACHMENT_STAGE_${staged.code}`);
            }
          }
          quarantined++;
          continue;
        }

        if (downloadedAttachments.length > 0 || rawAttachments.length > 0) {
          throw new Error("META_ATTACHMENT_SECURITY_CONTRACT_VIOLATION");
        }

        const claim = await claimEvent(sb, provider, messageId, ws.workspace_id);
        if (claim === "error") throw new Error("META_PROVIDER_CLAIM_FAILED");

        const messageTimestamp = Number.isFinite(Number(event.timestamp))
          ? new Date(Number(event.timestamp)).toISOString()
          : new Date().toISOString();

        const canonicalParams = {
          workspaceId:       ws.workspace_id,
          channelId:         ws.channel_id,
          accountIdentifier: pageId,
          providerEventId:   messageId,
          actorProviderId:   senderId,
          content,
          timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : undefined,
        };

        if (platform === "instagram") {
          // ── Instagram path ────────────────────────────────────────────────
          if (claim === "duplicate") {
            const igDupResult = await tryCanonicalInsert(sb, { ...canonicalParams, provider: "meta_ig" });
            if (igDupResult.status === "error") {
              return new Response(JSON.stringify({ error: "canonical_insert_failed" }), {
                status: 500,
                headers: { ...getCors(req), "Content-Type": "application/json" },
              });
            }
            continue;
          }

          // Idempotent inbox insert for Instagram
          const { data: igInboxRow, error: igInboxErr } = await sb.from("inbox_messages").insert({
            workspace_id:       ws.workspace_id,
            channel_id:         ws.channel_id,
            channel_type:       "instagram",
            source_name:        "Instagram",
            sender_name:        senderId,
            sender_identifier:  senderId,
            message_content:    content,
            message_timestamp:  messageTimestamp,
            direction:          "inbound",
            status:             "received",
            delivery_status:    "delivered",
            is_unread:          true,
            provider_message_id: messageId,
            metadata: {
              page_id: pageId,
              sender_id: senderId,
              content_security: {
                event_id: securityEventId,
                category: security.decision.category,
                risk_score: security.decision.risk_score,
                action: security.decision.action,
              },
            },
          }).select("id").single();

          if (igInboxErr && igInboxErr.code !== "23505") throw igInboxErr;
          if (igInboxErr?.code === "23505") {
            const { data: igInboxWinner } = await sb.from("inbox_messages").select("id")
              .eq("workspace_id", ws.workspace_id)
              .eq("provider_message_id", messageId)
              .limit(1).maybeSingle();
            if (!igInboxRow && igInboxWinner) (igInboxRow as any) = igInboxWinner;
          }

          // Leads upsert
          await sb.from("leads").upsert({
            workspace_id:       ws.workspace_id,
            channel_type:       "instagram",
            contact_identifier: senderId,
            source_type:        "instagram",
            status:             "new",
          }, { onConflict: "workspace_id,contact_identifier" });

          // Customer brain (fire-and-forget)
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `******`,
              "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
            },
            body: JSON.stringify({
              action: "feedback",
              workspace_id: ws.workspace_id,
              lead_id: igInboxRow?.id,
              event_type: "replied",
              channel: "instagram",
              event_data: { msg_id: messageId, page_id: pageId },
            }),
          }).catch(() => {});

          // Canonical engagement event (idempotent, repairable)
          const igCanResult = await tryCanonicalInsert(sb, { ...canonicalParams, provider: "meta_ig" });
          if (igCanResult.status === "error") {
            return new Response(JSON.stringify({ error: "canonical_insert_failed" }), {
              status: 500,
              headers: { ...getCors(req), "Content-Type": "application/json" },
            });
          }

          if (igCanResult.id) {
            const interestResult = await processInterestFromEngagementEventId(sb as any, igCanResult.id);
            if (interestResult.status === "error") throw new Error("META_INTEREST_MEMORY_FAILED");
          }

          processed++;

        } else {
          // ── Facebook Messenger path ───────────────────────────────────────
          if (claim === "duplicate") {
            const fbDupResult = await tryCanonicalInsert(sb, { ...canonicalParams, provider: "meta_fb" });
            if (fbDupResult.status === "error") {
              return new Response(JSON.stringify({ error: "canonical_insert_failed" }), {
                status: 500,
                headers: { ...getCors(req), "Content-Type": "application/json" },
              });
            }
            continue;
          }

          // Idempotent inbox insert for Facebook Messenger
          const { data: fbInboxRow, error: fbInboxErr } = await sb.from("inbox_messages").insert({
            workspace_id:       ws.workspace_id,
            channel_id:         ws.channel_id,
            channel_type:       "facebook",
            source_name:        "Facebook Messenger",
            sender_name:        senderId,
            sender_identifier:  senderId,
            message_content:    content,
            message_timestamp:  messageTimestamp,
            direction:          "inbound",
            status:             "received",
            delivery_status:    "delivered",
            is_unread:          true,
            provider_message_id: messageId,
            metadata: {
              page_id: pageId,
              sender_id: senderId,
              content_security: {
                event_id: securityEventId,
                category: security.decision.category,
                risk_score: security.decision.risk_score,
                action: security.decision.action,
              },
            },
          }).select("id").single();

          if (fbInboxErr && fbInboxErr.code !== "23505") throw fbInboxErr;
          if (fbInboxErr?.code === "23505") {
            const { data: fbInboxWinner } = await sb.from("inbox_messages").select("id")
              .eq("workspace_id", ws.workspace_id)
              .eq("provider_message_id", messageId)
              .limit(1).maybeSingle();
            if (!fbInboxRow && fbInboxWinner) (fbInboxRow as any) = fbInboxWinner;
          }

          // Leads upsert
          await sb.from("leads").upsert({
            workspace_id:       ws.workspace_id,
            channel_type:       "facebook",
            contact_identifier: senderId,
            source_type:        "facebook",
            status:             "new",
          }, { onConflict: "workspace_id,contact_identifier" });

          // Customer brain (fire-and-forget)
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `******`,
              "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
            },
            body: JSON.stringify({
              action: "feedback",
              workspace_id: ws.workspace_id,
              lead_id: fbInboxRow?.id,
              event_type: "replied",
              channel: "facebook",
              event_data: { msg_id: messageId, page_id: pageId },
            }),
          }).catch(() => {});

          // Canonical engagement event (idempotent, repairable)
          const fbCanResult = await tryCanonicalInsert(sb, { ...canonicalParams, provider: "meta_fb" });
          if (fbCanResult.status === "error") {
            return new Response(JSON.stringify({ error: "canonical_insert_failed" }), {
              status: 500,
              headers: { ...getCors(req), "Content-Type": "application/json" },
            });
          }

          if (fbCanResult.id) {
            const interestResult = await processInterestFromEngagementEventId(sb as any, fbCanResult.id);
            if (interestResult.status === "error") throw new Error("META_INTEREST_MEMORY_FAILED");
          }

          processed++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, quarantined }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[META-WEBHOOK] processing failed", error instanceof Error ? error.message : "unknown");
    return new Response(JSON.stringify({ error: "meta_processing_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
