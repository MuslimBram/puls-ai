import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationByName } from "./readMigrationByName";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const client = read("supabase/functions/_shared/content-security-client.ts");
const whatsapp = read("supabase/functions/whatsapp-webhook/index.ts");
const telegram = read("supabase/functions/telegram-webhook/index.ts");
const meta = read("supabase/functions/meta-webhook/index.ts");
const migration = readMigrationByName("content_security_wave1_inbox_idempotency.sql");

describe("P0.6 content-security ingress wave 1", () => {
  it("uses one internal fail-closed firewall client and never logs raw content", () => {
    expect(client).toContain('/functions/v1/content-security-firewall');
    expect(client).toContain('"x-internal-secret": internalSecret');
    expect(client).toContain("apikey: serviceKey");
    expect(client).toContain('Authorization: `Bearer ${serviceKey}`');
    expect(client).toContain('code: "CONTENT_SECURITY_NOT_CONFIGURED"');
    expect(client).toContain('code: "CONTENT_SECURITY_UNAVAILABLE"');
    expect(client).toContain('code: "CONTENT_SECURITY_INVALID_RESPONSE"');
    expect(client).not.toContain("console.log");
    expect(client).not.toContain("console.error");
  });

  it("extracts URI-like content so suspicious-link rules receive URLs", () => {
    expect(client).toContain("export function extractSecurityUrls");
    expect(client).toContain("javascript:");
    expect(client).toContain("data:");
    expect(client).toContain("ftp:");
    expect(client).toContain("unique.size >= 50");
  });

  it("adds race-safe provider-message uniqueness without silently deleting historical duplicates", () => {
    for (const channel of ["whatsapp", "telegram", "instagram", "facebook"]) {
      expect(migration).toContain(`channel_type = '${channel}'`);
      expect(migration).toContain(`inbox_messages_${channel}_provider_event_unique`);
    }
    expect(migration).toContain("GROUP BY workspace_id, channel_id, provider_message_id");
    expect(migration).toContain("HAVING count(*) > 1");
    expect(migration).toContain("RAISE EXCEPTION");
    expect(migration).not.toMatch(/delete\s+from\s+public\.inbox_messages/i);
  });

  it("gates WhatsApp at the real message call-site before normal side effects", () => {
    const flow = whatsapp.slice(whatsapp.indexOf("const security = await scanInboundContent({"));
    const scanCall = flow.indexOf("const security = await scanInboundContent({");
    const claimCall = flow.indexOf("const claim = await claimEvent(sb, waId");
    const threadCall = flow.indexOf('sb.rpc("upsert_conversation_thread"');
    const inboxCall = flow.indexOf("await ensureInboxMessage(sb");
    const leadCall = flow.indexOf("await ensureLead(sb");
    const brainCall = flow.indexOf('/functions/v1/customer-brain');

    for (const position of [scanCall, claimCall, threadCall, inboxCall, leadCall, brainCall]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(scanCall).toBeLessThan(claimCall);
    expect(scanCall).toBeLessThan(threadCall);
    expect(scanCall).toBeLessThan(inboxCall);
    expect(scanCall).toBeLessThan(leadCall);
    expect(scanCall).toBeLessThan(brainCall);
    expect(whatsapp).toContain("if (blocksNormalIngress(security.decision))");
  });

  it("distinguishes WhatsApp media from interactive opt-out events", () => {
    expect(whatsapp).toContain('const mediaTypes = new Set(["image", "audio", "video", "document", "sticker"])');
    expect(whatsapp).toContain('if (msg.type === "interactive")');
    expect(whatsapp).toContain("attachment: null");
    expect(whatsapp).toContain("attachment: { mime_type: mimeType }");
    expect(whatsapp).toContain('button.id.startsWith("OPT_OUT")');
    expect(whatsapp).not.toContain('msg.type !== "text"');
  });

  it("requires WhatsApp provider-native IDs and makes duplicate retries repair normal ingress", () => {
    expect(whatsapp).toContain('const waId = typeof msg?.id === "string" ? msg.id.trim() : ""');
    expect(whatsapp).toContain("A provider-native stable event ID is mandatory");
    expect(whatsapp).toContain("const securityEventId = `wa:${waId}`");
    expect(whatsapp).toContain("Duplicate provider retries execute the same idempotent repair path");
    expect(whatsapp).toContain("async function ensureInboxMessage");
    expect(whatsapp).toContain('insertError?.code === "23505"');
    expect(whatsapp).toContain("async function ensureLead");
  });

  it("never skips Telegram media and uses provider-native update_id as the retry identity", () => {
    expect(telegram).toContain("function telegramAttachment");
    expect(telegram).toContain("msg.photo");
    expect(telegram).toContain("msg.document");
    expect(telegram).toContain("msg.video");
    expect(telegram).toContain("msg.voice");
    expect(telegram).toContain("const updateId = payload?.update_id");
    expect(telegram).toContain("missing_update_id");
    expect(telegram).toContain("const idempotencyKey = `tg:${channel.id}:update:${String(updateId)}`");
    expect(telegram).toContain("attachment,");
    expect(telegram).not.toContain('skipped: "No text content"');
  });

  it("gates Telegram before integration claims, AI, lead, thread and Inbox", () => {
    const flow = telegram.slice(telegram.indexOf("const security = await scanInboundContent({"));
    const scanCall = flow.indexOf("const security = await scanInboundContent({");
    const eventLogClaim = flow.indexOf('supabase.from("integration_event_logs").insert');
    const aiCall = flow.indexOf("const aiRaw = await callAIRouter(");
    const leadAccess = flow.indexOf('.from("leads")');
    const threadCall = flow.indexOf('supabase.rpc("upsert_conversation_thread"');
    const inboxCall = flow.indexOf('.from("inbox_messages")');

    for (const position of [scanCall, eventLogClaim, aiCall, leadAccess, threadCall, inboxCall]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(scanCall).toBeLessThan(eventLogClaim);
    expect(scanCall).toBeLessThan(aiCall);
    expect(scanCall).toBeLessThan(leadAccess);
    expect(scanCall).toBeLessThan(threadCall);
    expect(scanCall).toBeLessThan(inboxCall);
    expect(telegram).toContain("if (blocksNormalIngress(security.decision))");
  });

  it("handles Telegram edits without creating a second provider-message Inbox row", () => {
    expect(telegram).toContain("payload?.edited_message");
    expect(telegram).toContain("const { data: existingInbox");
    expect(telegram).toContain("if (existingInbox && payload?.edited_message)");
    expect(telegram).toContain("edited: true");
    expect(telegram).toContain('provider_message_id: String(messageId)');
  });

  it("authenticates and resolves Meta before invoking its message processor", () => {
    const serveBlock = meta.slice(meta.indexOf("serve(async (req)"));
    const signatureCall = serveBlock.indexOf("const signature = await verifyMetaSignature(");
    const resolverCall = serveBlock.indexOf("const mapping = await resolveWorkspaceFromPage(sb, pageId, platform)");
    const processorCall = serveBlock.indexOf("const result = await processMetaMessage(sb");

    for (const position of [signatureCall, resolverCall, processorCall]) expect(position).toBeGreaterThan(-1);
    expect(signatureCall).toBeLessThan(resolverCall);
    expect(resolverCall).toBeLessThan(processorCall);
  });

  it("gates the Meta processor before provider claim and repair side effects", () => {
    const processor = meta.slice(
      meta.indexOf("async function processMetaMessage"),
      meta.indexOf("serve(async (req)"),
    );
    const scanCall = processor.indexOf("const security = await scanInboundContent({");
    const claimCall = processor.indexOf("const claim = await claimEvent(sb, params.provider");
    const inboxCall = processor.indexOf("await ensureInboxMessage(sb");
    const leadCall = processor.indexOf("await ensureLead(sb");
    const canonicalCall = processor.indexOf("await ensureCanonicalEvent(sb");

    for (const position of [scanCall, claimCall, inboxCall, leadCall, canonicalCall]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(scanCall).toBeLessThan(claimCall);
    expect(claimCall).toBeLessThan(inboxCall);
    expect(claimCall).toBeLessThan(leadCall);
    expect(claimCall).toBeLessThan(canonicalCall);
    expect(processor).toContain("if (blocksNormalIngress(security.decision))");
    expect(processor).toContain('attachment: attachments.length ? { mime_type: "application/octet-stream" } : null');
  });

  it("never invents Meta message IDs and makes duplicate claims execute repair", () => {
    expect(meta).toContain('const messageId = typeof message.mid === "string" ? message.mid.trim() : ""');
    expect(meta).toContain('const senderId = typeof params.event?.sender?.id === "string"');
    expect(meta).toContain('if (!messageId || !senderId) return "quarantined"');
    expect(meta).not.toContain("event.timestamp ?? Date.now()");
    expect(meta).toContain("Both the winning claim and a duplicate retry execute the same idempotent");
    expect(meta).toContain("async function ensureInboxMessage");
    expect(meta).toContain("async function ensureLead");
    expect(meta).toContain("async function ensureCanonicalEvent");
    expect(meta).toContain('insertError?.code === "23505"');
    expect(meta).not.toContain('.single().catch(() => ({ data: null }))');
  });

  it("persists machine security decision metadata on normal Inbox rows", () => {
    for (const source of [whatsapp, telegram, meta]) {
      expect(source).toContain("content_security:");
      expect(source).toContain("category:");
      expect(source).toContain("risk_score:");
      expect(source).toContain("action:");
    }
  });
});
