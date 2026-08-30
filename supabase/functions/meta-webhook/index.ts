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

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: true });
const rateLimitMap = new Map<string, { n: number; t: number }>();

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

type WorkspaceMapping = { workspace_id: string; channel_id: string };

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

async function ensureInboxMessage(
  sb: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    channelId: string;
    channelType: "instagram" | "facebook";
    sourceName: string;
    senderId: string;
    content: string;
    messageId: string;
    messageTimestamp: string;
    pageId: string;
    securityEventId: string;
    security: { category: string; risk_score: number; action: string };
  },
): Promise<string> {
  const { data: existing, error: lookupError } = await sb
    .from("inbox_messages")
    .select("id")
    .eq("workspace_id", params.workspaceId)
    .eq("channel_id", params.channelId)
    .eq("provider_message_id", params.messageId)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id;

  const { data: inserted, error: insertError } = await sb.from("inbox_messages").insert({
    workspace_id: params.workspaceId,
    channel_id: params.channelId,
    channel_type: params.channelType,
    source_name: params.sourceName,
    sender_name: params.senderId,
    sender_identifier: params.senderId,
    message_content: params.content,
    message_timestamp: params.messageTimestamp,
    direction: "inbound",
    status: "received",
    delivery_status: "delivered",
    is_unread: true,
    provider_message_id: params.messageId,
    metadata: {
      page_id: params.pageId,
      sender_id: params.senderId,
      content_security: {
        event_id: params.securityEventId,
        category: params.security.category,
        risk_score: params.security.risk_score,
        action: params.security.action,
      },
    },
  }).select("id").single();

  if (!insertError && inserted?.id) return inserted.id;
  if (insertError?.code === "23505") {
    const { data: winner, error: winnerError } = await sb
      .from("inbox_messages")
      .select("id")
      .eq("workspace_id", params.workspaceId)
      .eq("channel_id", params.channelId)
      .eq("provider_message_id", params.messageId)
      .limit(1)
      .maybeSingle();
    if (!winnerError && winner?.id) return winner.id;
  }
  throw new Error("META_INBOX_PERSIST_FAILED");
}

async function ensureLead(
  sb: ReturnType<typeof createClient>,
  params: {
    workspaceId: string;
    channelType: "instagram" | "facebook";
    senderId: string;
  },
): Promise<string> {
  const { data: lead, error } = await sb.from("leads").upsert({
    workspace_id: params.workspaceId,
    channel_type: params.channelType,
    contact_identifier: params.senderId,
    source_type: params.channelType,
    status: "new",
  }, { onConflict: "workspace_id,contact_identifier" }).select("id").single();
  if (error || !lead?.id) throw new Error("META_LEAD_PERSIST_FAILED");
  return lead.id;
}

async function ensureCanonicalEvent(
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
): Promise<string> {
  const canonicalEvent = buildCanonicalEngagementEvent({
    workspace_id: params.workspaceId,
    channel_id: params.channelId,
    provider: params.provider,
    account_identifier: params.accountIdentifier,
    event_type: "message_received",
    provider_event_id: params.providerEventId,
    actor_provider_id: params.actorProviderId,
    content_ref: params.content,
    event_timestamp: params.timestamp != null
      ? new Date(params.timestamp).toISOString()
      : new Date().toISOString(),
    normalized_metadata: { page_id: params.accountIdentifier },
    consent_classification: "platform_terms",
  });

  const { data: inserted, error } = await sb.from("social_engagement_events").insert({
    workspace_id: canonicalEvent.workspace_id,
    channel_id: canonicalEvent.channel_id,
    provider: canonicalEvent.provider,
    account_identifier: canonicalEvent.account_identifier,
    event_type: canonicalEvent.event_type,
    provider_event_id: canonicalEvent.provider_event_id,
    actor_provider_id: canonicalEvent.actor_provider_id,
    actor_identity_state: canonicalEvent.actor_identity_state,
    is_anonymous_aggregate: canonicalEvent.is_anonymous_aggregate,
    content_ref: canonicalEvent.content_ref,
    event_timestamp: canonicalEvent.event_timestamp,
    normalized_metadata: canonicalEvent.normalized_metadata,
    consent_classification: canonicalEvent.consent_classification,
    source_ref: canonicalEvent.source_ref,
    idempotency_key: canonicalEvent.idempotency_key,
  }).select("id").single();

  if (!error && inserted?.id) return inserted.id;
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await sb
      .from("social_engagement_events")
      .select("id")
      .eq("idempotency_key", canonicalEvent.idempotency_key)
      .limit(1)
      .maybeSingle();
    if (!existingError && existing?.id) return existing.id;
  }
  throw new Error("META_CANONICAL_EVENT_PERSIST_FAILED");
}

async function processMetaMessage(
  sb: ReturnType<typeof createClient>,
  params: {
    mapping: WorkspaceMapping;
    pageId: string;
    event: Record<string, any>;
    provider: "meta_ig" | "meta_fb";
    channelType: "instagram" | "facebook";
    sourceName: string;
  },
): Promise<"processed" | "quarantined" | "skipped"> {
  const message = params.event?.message;
  if (!message) return "skipped";

  const messageId = typeof message.mid === "string" ? message.mid.trim() : "";
  const senderId = typeof params.event?.sender?.id === "string" ? params.event.sender.id.trim() : "";
  if (!messageId || !senderId) return "quarantined";

  const text = typeof message.text === "string" ? message.text : "";
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const content = text || (attachments.length ? "[attachment]" : "");
  if (!content) return "skipped";

  const securityEventId = `${params.provider === "meta_ig" ? "ig" : "fb"}:${messageId}`;
  const security = await scanInboundContent({
    workspace_id: params.mapping.workspace_id,
    source: params.provider,
    event_id: securityEventId,
    content,
    urls: extractSecurityUrls(content),
    attachment: attachments.length ? { mime_type: "application/octet-stream" } : null,
  });

  if (!security.ok) throw new Error("META_CONTENT_SECURITY_UNAVAILABLE");
  if (blocksNormalIngress(security.decision)) return "quarantined";

  const claim = await claimEvent(sb, params.provider, messageId, params.mapping.workspace_id);
  if (claim === "error") throw new Error("META_PROVIDER_CLAIM_FAILED");

  // Both the winning claim and a duplicate retry execute the same idempotent
  // repair path. This prevents a prior post-claim Inbox/lead failure from being
  // made permanent by the provider claim.
  const messageTimestamp = Number.isFinite(Number(params.event.timestamp))
    ? new Date(Number(params.event.timestamp)).toISOString()
    : new Date().toISOString();

  await ensureInboxMessage(sb, {
    workspaceId: params.mapping.workspace_id,
    channelId: params.mapping.channel_id,
    channelType: params.channelType,
    sourceName: params.sourceName,
    senderId,
    content,
    messageId,
    messageTimestamp,
    pageId: params.pageId,
    securityEventId,
    security: security.decision,
  });

  const leadId = await ensureLead(sb, {
    workspaceId: params.mapping.workspace_id,
    channelType: params.channelType,
    senderId,
  });

  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/customer-brain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getServiceKey()}`,
      "x-internal-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "",
    },
    body: JSON.stringify({
      action: "feedback",
      workspace_id: params.mapping.workspace_id,
      lead_id: leadId,
      event_type: "replied",
      channel: params.channelType,
      event_data: { msg_id: messageId, page_id: params.pageId },
    }),
  }).catch(() => {});

  const canonicalEventId = await ensureCanonicalEvent(sb, {
    workspaceId: params.mapping.workspace_id,
    channelId: params.mapping.channel_id,
    provider: params.provider,
    accountIdentifier: params.pageId,
    providerEventId: messageId,
    actorProviderId: senderId,
    content,
    timestamp: Number.isFinite(Number(params.event.timestamp)) ? Number(params.event.timestamp) : undefined,
  });

  const interestResult = await processInterestFromEngagementEventId(sb as any, canonicalEventId);
  if (interestResult.status === "error") throw new Error("META_INTEREST_MEMORY_FAILED");

  return "processed";
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

      const mapping = await resolveWorkspaceFromPage(sb, pageId, platform);
      if (mapping === "AMBIGUOUS" || !mapping) {
        quarantined++;
        continue;
      }

      const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const event of messaging) {
        const result = await processMetaMessage(sb, {
          mapping,
          pageId,
          event,
          provider: platform === "instagram" ? "meta_ig" : "meta_fb",
          channelType: platform,
          sourceName: platform === "instagram" ? "Instagram" : "Facebook Messenger",
        });
        if (result === "processed") processed++;
        if (result === "quarantined") quarantined++;
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
