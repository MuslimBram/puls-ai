import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const client = read("supabase/functions/_shared/content-security-client.ts");
const whatsapp = read("supabase/functions/whatsapp-webhook/index.ts");
const telegram = read("supabase/functions/telegram-webhook/index.ts");
const meta = read("supabase/functions/meta-webhook/index.ts");
const migration = read("supabase/migrations/20260830221000_content_security_wave1_inbox_idempotency.sql");

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

  it("gates WhatsApp before provider claim, thread, Inbox, lead, or customer-brain side effects", () => {
    const scanCall = whatsapp.indexOf("const security = await scanInboundContent({");
    const claimCall = whatsapp.indexOf('const claim = await claimEvent(sb, "whatsapp"');
    const threadCall = whatsapp.indexOf('sb.rpc("upsert_conversation_thread"');
    const inboxCall = whatsapp.indexOf('sb.from("inbox_messages").insert');
    const leadCall = whatsapp.indexOf('sb.from("leads").upsert');
    const brainCall = whatsapp.indexOf('/functions/v1/customer-brain');

    expect(scanCall).toBeGreaterThan(-1);
    expect(scanCall).toBeLessThan(claimCall);
    expect(scanCall).toBeLessThan(threadCall);
    expect(scanCall).toBeLessThan(inboxCall);
    expect(scanCall).toBeLessThan(leadCall);
    expect(scanCall).toBeLessThan(brainCall);
    expect(whatsapp).toContain("if (blocksNormalIngress(security.decision))");
    expect(whatsapp).toContain('attachment: hasAttachment ? { mime_type: "application/octet-stream" } : null');
  });

  it("requires WhatsApp provider-native IDs instead of creating unstable retry keys", () => {
    expect(whatsapp).toContain('const waId = msg?.id ?? ""');
    expect(whatsapp).not.toContain('msg?.id ?? `wa:${Date.now()}`');
    expect(whatsapp).toContain("A provider-native stable event ID is mandatory");
    expect(whatsapp).toContain("const securityEventId = `wa:${waId}`");
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
    const scanCall = telegram.indexOf("const security = await scanInboundContent({");
    const eventLogClaim = telegram.indexOf('supabase.from("integration_event_logs").insert');
    const aiCall = telegram.indexOf("const aiRaw = await callAIRouter(");
    const leadAccess = telegram.indexOf('.from("leads")');
    const threadCall = telegram.indexOf('supabase.rpc("upsert_conversation_thread"');
    const inboxCall = telegram.indexOf('.from("inbox_messages")');

    expect(scanCall).toBeGreaterThan(-1);
    expect(scanCall).toBeLessThan(eventLogClaim);
    expect(scanCall).toBeLessThan(aiCall);
    expect(scanCall).toBeLessThan(leadAccess);
    expect(scanCall).toBeLessThan(threadCall);
    expect(scanCall).toBeLessThan(inboxCall);
    expect(telegram).toContain("if (blocksNormalIngress(security.decision))");
    expect(telegram).toContain('source: "telegram"');
    expect(telegram).toContain("event_id: idempotencyKey");
  });

  it("handles Telegram edits without creating a second provider-message Inbox row", () => {
    expect(telegram).toContain("payload?.edited_message");
    expect(telegram).toContain("const { data: existingInbox");
    expect(telegram).toContain("if (existingInbox && payload?.edited_message)");
    expect(telegram).toContain("edited: true");
    expect(telegram).toContain('provider_message_id: String(messageId)');
  });

  it("gates Meta after signature and tenant resolution and before provider claim", () => {
    const signatureCall = meta.indexOf("verifyMetaSignature(");
    const resolverCall = meta.indexOf("resolveWorkspaceFromPage(sb, pageId, platform)");
    const scanCall = meta.indexOf("const security = await scanInboundContent({");
    const claimCall = meta.indexOf("const claim = await claimEvent(sb, params.provider");

    expect(signatureCall).toBeGreaterThan(-1);
    expect(resolverCall).toBeGreaterThan(-1);
    expect(scanCall).toBeGreaterThan(-1);
    expect(claimCall).toBeGreaterThan(-1);
    expect(signatureCall).toBeLessThan(resolverCall);
    expect(resolverCall).toBeLessThan(scanCall);
    expect(scanCall).toBeLessThan(claimCall);
    expect(meta).toContain("if (blocksNormalIngress(security.decision))");
    expect(meta).toContain('attachment: attachments.length ? { mime_type: "application/octet-stream" } : null');
  });

  it("never invents Meta message IDs and requires sender identity", () => {
    expect(meta).toContain('const messageId = typeof message.mid === "string" ? message.mid.trim() : ""');
    expect(meta).toContain('const senderId = typeof params.event?.sender?.id === "string"');
    expect(meta).toContain('if (!messageId || !senderId) return "quarantined"');
    expect(meta).not.toContain("event.timestamp ?? Date.now()");
  });

  it("makes duplicate Meta claims execute an idempotent repair path", () => {
    expect(meta).toContain("Both the winning claim and a duplicate retry execute the same idempotent");
    expect(meta).toContain("async function ensureInboxMessage");
    expect(meta).toContain("async function ensureLead");
    expect(meta).toContain("async function ensureCanonicalEvent");
    expect(meta).toContain('insertError?.code === "23505"');
    expect(meta).toContain("processInterestFromEngagementEventId");
    expect(meta).not.toContain('.from("inbox_messages").insert({\n            workspace_id');
    expect(meta).not.toContain('.single().catch(() => ({ data: null }))');
  });

  it("persists only machine security decision metadata on normal Inbox rows", () => {
    for (const source of [whatsapp, telegram, meta]) {
      expect(source).toContain("content_security:");
      expect(source).toContain("category:");
      expect(source).toContain("risk_score:");
      expect(source).toContain("action:");
    }
  });
});
