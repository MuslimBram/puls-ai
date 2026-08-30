import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const client = read("supabase/functions/_shared/content-security-client.ts");
const whatsapp = read("supabase/functions/whatsapp-webhook/index.ts");
const telegram = read("supabase/functions/telegram-webhook/index.ts");
const meta = read("supabase/functions/meta-webhook/index.ts");

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

  it("gates Telegram before integration log claims, AI, lead, thread, and Inbox", () => {
    const scanCall = telegram.indexOf("const security = await scanInboundContent({");
    const eventLogClaim = telegram.indexOf('supabase.from("integration_event_logs").insert');
    const aiCall = telegram.indexOf("const aiRaw = await callAIRouter(");
    const leadAccess = telegram.indexOf('.from("leads")');
    const threadCall = telegram.indexOf('supabase.rpc("upsert_conversation_thread"');
    const inboxCall = telegram.indexOf('supabase.from("inbox_messages").insert');

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

  it("gates both Instagram and Facebook message branches before provider claims and normal side effects", () => {
    expect((meta.match(/const security = await scanInboundContent\(\{/g) ?? []).length).toBe(2);
    expect(meta).toContain('source: "meta_ig"');
    expect(meta).toContain('source: "meta_fb"');
    expect(meta).toContain("const securityEventId = `ig:${msgId}`");
    expect(meta).toContain("const securityEventId = `fb:${msgId}`");

    const igStart = meta.indexOf('if (objectType === "instagram")');
    const fbStart = meta.indexOf('else if (objectType === "page")');
    const igBlock = meta.slice(igStart, fbStart);
    const fbBlock = meta.slice(fbStart);

    expect(igBlock.indexOf("const security = await scanInboundContent({")).toBeLessThan(
      igBlock.indexOf('const claim = await claimEvent(sb, "meta_ig"'),
    );
    expect(igBlock.indexOf("const security = await scanInboundContent({")).toBeLessThan(
      igBlock.indexOf('sb.from("inbox_messages").insert'),
    );
    expect(fbBlock.indexOf("const security = await scanInboundContent({")).toBeLessThan(
      fbBlock.indexOf('const claim = await claimEvent(sb, "meta_fb"'),
    );
    expect(fbBlock.indexOf("const security = await scanInboundContent({")).toBeLessThan(
      fbBlock.indexOf('sb.from("inbox_messages").insert'),
    );
  });

  it("never invents Meta message IDs and quarantines attachment-bearing messages before normal ingress", () => {
    expect(meta).not.toContain("event.timestamp ?? Date.now()");
    expect(meta).toContain("Missing provider message ID — fail closed");
    expect((meta.match(/attachment: attachments.length \? \{ mime_type: "application\/octet-stream" \} : null/g) ?? []).length).toBe(2);
    expect((meta.match(/if \(blocksNormalIngress\(security.decision\)\)/g) ?? []).length).toBe(2);
  });

  it("persists only machine security decision metadata on allowed/tagged Inbox rows", () => {
    for (const source of [whatsapp, telegram, meta]) {
      expect(source).toContain("content_security:");
      expect(source).toContain("category: security.decision.category");
      expect(source).toContain("risk_score: security.decision.risk_score");
      expect(source).toContain("action: security.decision.action");
    }
  });
});
