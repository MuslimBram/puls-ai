import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const stageClient = read("supabase/functions/_shared/content-security-attachment-client.ts");
const stage = read("supabase/functions/content-security-attachment-stage/index.ts");
const whatsapp = read("supabase/functions/whatsapp-webhook/index.ts");
const telegram = read("supabase/functions/telegram-webhook/index.ts");
const sms = read("supabase/functions/sms-webhook/index.ts");
const meta = read("supabase/functions/meta-webhook/index.ts");

describe("P0.6 provider attachment E2E staging", () => {
  it("resolves the canonical quarantined DB parent before raw-byte staging", () => {
    expect(stageClient).toContain('.from("content_security_events")');
    expect(stageClient).toContain('.eq("processing_status", "completed")');
    expect(stageClient).toContain('.eq("action", "quarantine")');
    expect(stageClient).toContain('"x-security-event-id": String(parent.id)');
    expect(stageClient).toContain('body: input.bytes');
    expect(stageClient).not.toMatch(/source_url|provider_url|x-source-url/i);
    expect(stage).toContain("req.arrayBuffer()");
    expect(stage).toContain('crypto.subtle.digest("SHA-256", bytes)');
  });

  it("downloads WhatsApp media with tenant credentials and fingerprints real bytes before firewall", () => {
    const download = whatsapp.indexOf("downloaded = await downloadWhatsAppMedia(");
    const scan = whatsapp.indexOf("const security = await scanInboundContent({");
    const stageCall = whatsapp.indexOf("const staged = await stageInboundAttachment({");
    const inbox = whatsapp.indexOf("const claim = await claimEvent(");
    expect(download).toBeGreaterThan(-1);
    expect(download).toBeLessThan(scan);
    expect(scan).toBeLessThan(stageCall);
    expect(stageCall).toBeLessThan(inbox);
    expect(whatsapp).toContain("credentials_encrypted");
    expect(whatsapp).toContain("decryptIfNeeded(tokenValue)");
    expect(whatsapp).toContain('url.hostname === "lookaside.fbsbx.com"');
    expect(whatsapp).toContain('redirect: "error"');
    expect(whatsapp).toContain("size_bytes: downloaded?.bytes.byteLength");
    expect(whatsapp).toContain("sha256: downloaded?.sha256");
    expect(whatsapp).toContain('attachment_key: "wa_media_0"');
    expect(whatsapp).toContain("attachment_security_contract_violation");
  });

  it("downloads Telegram file_id bytes from the fixed Bot API host before firewall", () => {
    const download = telegram.indexOf("downloaded = await downloadTelegramFile(");
    const scan = telegram.indexOf("const security = await scanInboundContent({");
    const stageCall = telegram.indexOf("const staged = await stageInboundAttachment({");
    const normalClaim = telegram.indexOf('.from("external_integrations")');
    expect(download).toBeGreaterThan(-1);
    expect(download).toBeLessThan(scan);
    expect(scan).toBeLessThan(stageCall);
    expect(stageCall).toBeLessThan(normalClaim);
    expect(telegram).toContain("credentials.bot_token");
    expect(telegram).toContain("decryptIfNeeded(encryptedToken)");
    expect(telegram).toContain("https://api.telegram.org/bot${botToken}/getFile");
    expect(telegram).toContain("https://api.telegram.org/file/bot${botToken}/${filePath}");
    expect(telegram).toContain("validTelegramFilePath");
    expect(telegram).toContain('attachment_key: "tg_media_0"');
    expect(telegram).toContain("attachment_security_contract_violation");
  });

  it("requires every declared Twilio MMS media item and binds the whole manifest", () => {
    const download = sms.indexOf("downloaded = await downloadTwilioMedia(");
    const scan = sms.indexOf("const security = await scanInboundContent({");
    const stageCall = sms.indexOf("const staged = await stageInboundAttachment({");
    const claim = sms.indexOf("const claim = await claimInboundEvent(");
    expect(download).toBeGreaterThan(-1);
    expect(download).toBeLessThan(scan);
    expect(scan).toBeLessThan(stageCall);
    expect(stageCall).toBeLessThan(claim);
    expect(sms).toContain("numMedia > MAX_MEDIA_ITEMS");
    expect(sms).toContain("missing MediaUrl${i}");
    expect(sms).toContain('url.hostname !== "api.twilio.com"');
    expect(sms).toContain("wsCreds.account_sid");
    expect(sms).toContain("wsCreds.decrypted_auth_token");
    expect(sms).toContain("JSON.stringify(manifest)");
    expect(sms).toContain("expected_attachment_count: downloadedMedia.length");
    expect(sms).toContain("attachment_key: `twilio_media_${media.index}`");
  });

  it("downloads only signed Meta CDN attachment URLs and binds/stages every item", () => {
    const normalize = meta.indexOf("const attachments = normalizeMetaAttachments(rawAttachments)");
    const download = meta.indexOf("const downloaded = await downloadMetaAttachment(attachment)");
    const scan = meta.indexOf("const security = await scanInboundContent({");
    const stageCall = meta.indexOf("const staged = await stageInboundAttachment({");
    const claim = meta.indexOf("const claim = await claimEvent(");
    expect(normalize).toBeGreaterThan(-1);
    expect(normalize).toBeLessThan(download);
    expect(download).toBeLessThan(scan);
    expect(scan).toBeLessThan(stageCall);
    expect(stageCall).toBeLessThan(claim);
    expect(meta).toContain('host.endsWith(".fbcdn.net")');
    expect(meta).toContain('host.endsWith(".fbsbx.com")');
    expect(meta).toContain('host.endsWith(".cdninstagram.com")');
    expect(meta).toContain('redirect: "error"');
    expect(meta).toContain("JSON.stringify(manifest)");
    expect(meta).toContain("expected_attachment_count: downloadedAttachments.length");
    expect(meta).toContain("attachment_key: `meta_media_${attachment.index}`");
    expect(meta).toContain("META_ATTACHMENT_SECURITY_CONTRACT_VIOLATION");
  });

  it("never lets a provider attachment continue into normal business processing", () => {
    expect(whatsapp).toContain("if (downloaded || normalized.attachment)");
    expect(telegram).toContain("if (downloaded || attachment)");
    expect(sms).toContain("if (downloadedMedia.length > 0 || mediaItems.length > 0)");
    expect(meta).toContain("if (downloadedAttachments.length > 0 || rawAttachments.length > 0)");
  });
});
