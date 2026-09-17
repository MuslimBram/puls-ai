import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationByName } from "./readMigrationByName";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const emailPoll = read("supabase/functions/email-poll/index.ts");
const emailIngest = read("supabase/functions/email-ingest/index.ts");
const emailVerify = read("supabase/functions/verify-email-connection/index.ts");
const networkGuard = read("supabase/functions/_shared/public-network-guard.ts");
const webchat = read("supabase/functions/webchat-ingest/index.ts");
const webchatProxy = read("supabase/functions/webchat-proxy/index.ts");
const webchatValidator = read("supabase/functions/_shared/webchat-channel-validator.ts");
const customWebhook = read("supabase/functions/webhook-ingest/index.ts");
const webhookSetup = read("src/components/WebhookSetup.tsx");
const sms = read("supabase/functions/sms-webhook/index.ts");
const config = read("supabase/config.toml");
const emailMigration = readMigrationByName("email_ingress_idempotency.sql");
const webchatMigration = readMigrationByName("webchat_ingress_idempotency.sql");
const smsMigration = readMigrationByName("sms_ingress_idempotency.sql");
const customMigration = readMigrationByName("custom_webhook_ingress_idempotency.sql");
const firstIndex = (source: string, pattern: RegExp) => source.search(pattern);

describe("P0.6 content-security ingress wave 2", () => {
  it("keeps Email verification and cron runtime on the same public-IP-pinned TLS guard", () => {
    expect(emailVerify).toContain("connectTlsToPublicHostname(host, 993)");
    expect(emailPoll).toContain("connectTlsToPublicHostname(host, 993)");
    expect(networkGuard).toContain("resolvePublicAddresses");
    expect(networkGuard).toContain("Deno.connect({ hostname: address, port })");
    expect(networkGuard).toContain("Deno.startTls(tcp, { hostname: normalized");
    expect(networkGuard).toContain("Connected peer is not a public network address");
    const verifyConfig = config.slice(config.indexOf("[functions.verify-email-connection]"));
    expect(verifyConfig).toContain("[functions.verify-email-connection]");
    expect(verifyConfig.split("\n").slice(0, 2).join("\n")).toContain("verify_jwt = true");
  });

  it("retires the tenant-unbound legacy Email ingest endpoint", () => {
    expect(emailIngest).toContain("EMAIL_INGEST_RETIRED");
    expect(emailIngest).toContain("status: 410");
    expect(emailIngest).not.toContain('.from("inbox_messages").insert');
  });

  it("uses firewall-safe canonical Email event IDs and preserves historical reply threading", () => {
    expect(emailPoll).toContain("async function canonicalMessageIdToken");
    expect(emailPoll).toContain("email_mid:${await sha256Hex");
    expect(emailPoll).toContain("email_sha256:${hash}");
    expect(emailPoll).toContain("canonicalReplyId");
    expect(emailPoll).toContain('.in("provider_message_id", [canonicalReplyId, headers.inReplyTo])');
  });

  it("gates Email before duplicate lookup, keywords, AI, thread and Inbox side effects", () => {
    const scan = firstIndex(emailPoll, /const security = await scanInboundContent\(\{/);
    const duplicate = firstIndex(emailPoll, /const \{ data: existingMsg,/);
    const keywords = firstIndex(emailPoll, /const \{ data: keywords,/);
    const ai = firstIndex(emailPoll, /const aiRes = await routerChatCompletion\(\{/);
    const thread = firstIndex(emailPoll, /\.from\("conversation_threads"\)/);
    const inbox = firstIndex(emailPoll, /\.from\("inbox_messages"\)\s*\.insert\(/);

    for (const position of [scan, duplicate, keywords, ai, thread, inbox]) expect(position).toBeGreaterThan(-1);
    expect(scan).toBeLessThan(duplicate);
    expect(scan).toBeLessThan(keywords);
    expect(scan).toBeLessThan(ai);
    expect(scan).toBeLessThan(thread);
    expect(scan).toBeLessThan(inbox);
    expect(emailPoll).toContain('source: "email"');
    expect(emailPoll).toContain("headers.hasAttachment");
  });

  it("does not silently consume attachment Email before malware staging exists", () => {
    expect(emailPoll).toContain("if (!headers.hasAttachment)");
    expect(emailPoll).toContain("STORE ${msgId} +FLAGS (\\\\Seen)");
    expect(emailPoll).toContain("Attachment-bearing mail stays UNSEEN");
  });

  it("gates Webchat after internal auth/tenant resolution and before dedupe or business side effects", () => {
    expect(webchatValidator).toContain('error: "event_id is required"');
    expect(webchatProxy).toContain("event_id,");
    expect(webchatProxy).not.toContain("crypto.randomUUID()");
    const auth = firstIndex(webchat, /requireInternalSecret\(req\)/);
    const tenant = firstIndex(webchat, /const workspaceId = channel\.workspace_id/);
    const scan = firstIndex(webchat, /const security = await scanInboundContent\(\{/);
    const duplicate = firstIndex(webchat, /const \{ data: existing,/);
    const keywords = firstIndex(webchat, /const \{ data: keywords,/);
    const inbox = firstIndex(webchat, /\.from\("inbox_messages"\)\s*\.insert\(/);
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(tenant);
    expect(tenant).toBeLessThan(scan);
    expect(scan).toBeLessThan(duplicate);
    expect(scan).toBeLessThan(keywords);
    expect(scan).toBeLessThan(inbox);
    expect(webchat).toContain('source: "webchat"');
  });

  it("requires timestamped HMAC-SHA256 before Custom Webhook reaches Content Security", () => {
    expect(customWebhook).toContain("const SIGNATURE_WINDOW_SECONDS = 300");
    expect(customWebhook).toContain('req.headers.get("x-webhook-event-id")');
    expect(customWebhook).toContain('req.headers.get("x-webhook-timestamp")');
    expect(customWebhook).toContain('req.headers.get("x-webhook-signature")');
    expect(customWebhook).toContain('const signingPayload = `${timestampHeader}.${eventId}.${rawBody}`');
    expect(customWebhook).toContain("{ name: \"HMAC\", hash: \"SHA-256\" }");
    expect(customWebhook).toContain("if (bodyEventId !== eventId)");
    expect(customWebhook).not.toContain('req.headers.get("x-webhook-secret")');

    const tenant = firstIndex(customWebhook, /const workspaceId = String\(channel\.workspace_id\)/);
    const hmac = firstIndex(customWebhook, /secureEqualHex\(expectedSignature,\s*signatureMatch\[1\]!?.toLowerCase\(\)\)/);
    const scan = firstIndex(customWebhook, /const security = await scanInboundContent\(\{/);
    const duplicate = firstIndex(customWebhook, /const \{ data: existing,/);
    const keywords = firstIndex(customWebhook, /const \{ data: keywords,/);
    const inbox = firstIndex(customWebhook, /\.from\("inbox_messages"\)\s*\.insert\(/);

    for (const position of [hmac, tenant, scan, duplicate, keywords, inbox]) expect(position).toBeGreaterThan(-1);
    expect(hmac).toBeLessThan(tenant);
    expect(tenant).toBeLessThan(scan);
    expect(scan).toBeLessThan(duplicate);
    expect(scan).toBeLessThan(keywords);
    expect(scan).toBeLessThan(inbox);
    expect(customWebhook).toContain('source: "custom_webhook"');
  });

  it("keeps Custom Webhook UI aligned with HMAC v1 instead of bearer-secret auth", () => {
    expect(webhookSetup).toContain("async function hmacSha256Hex");
    expect(webhookSetup).toContain('"X-Webhook-Timestamp": timestamp');
    expect(webhookSetup).toContain('"X-Webhook-Event-Id": eventId');
    expect(webhookSetup).toContain('"X-Webhook-Signature": `v1=${signature}`');
    expect(webhookSetup).toContain('const signingPayload = `${timestamp}.${eventId}.${rawBody}`');
    expect(webhookSetup).not.toContain('"X-Webhook-Secret": sessionSecret');
  });

  it("gates signed Twilio SMS/MMS before provider claim, thread, keywords and Inbox", () => {
    const signature = firstIndex(sms, /verifyTwilioSignature\(req,\s*rawBody,/);
    const tenant = firstIndex(sms, /const workspaceId = wsCreds\.workspace_id/);
    const scan = firstIndex(sms, /const security = await scanInboundContent\(\{/);
    const claim = firstIndex(sms, /const claim = await claimInboundEvent/);
    const thread = firstIndex(sms, /supabase\.rpc\("upsert_conversation_thread"/);
    const keywords = firstIndex(sms, /\.from\("keywords"\)/);
    const inbox = firstIndex(sms, /\.from\("inbox_messages"\)\.insert/);
    expect(signature).toBeGreaterThan(-1);
    expect(signature).toBeLessThan(tenant);
    expect(tenant).toBeLessThan(scan);
    expect(scan).toBeLessThan(claim);
    expect(scan).toBeLessThan(thread);
    expect(scan).toBeLessThan(keywords);
    expect(scan).toBeLessThan(inbox);
    expect(sms).toContain('source: "sms"');
    expect(sms).toContain("mediaItems.length > 0");
  });

  it("never lets media-only MMS bypass security or persist provider URLs before malware scan", () => {
    expect(sms).toContain("(!body && mediaItems.length === 0)");
    expect(sms).toContain('const securityContent = body || "[attachment]"');
    expect(sms).toContain("attachment: mediaItems.length > 0");
    expect(sms).not.toContain('provider_url: media.url');
    expect(sms).not.toContain('.from("message_media").insert');
  });

  it("keeps race-safe provider idempotency migrations fail-fast and non-destructive", () => {
    const migrations = [emailMigration, webchatMigration, smsMigration, customMigration];
    for (const migration of migrations) {
      const lower = migration.toLowerCase();
      expect(lower).toContain("create unique index");
      expect(lower).toContain("having count(*) > 1");
      expect(lower).not.toMatch(/delete\s+from\s+public\.inbox_messages/);
    }
  });

  it("stores only machine content-security metadata on allowed normal Inbox records", () => {
    for (const source of [emailPoll, webchat, customWebhook, sms]) {
      expect(source).toContain("content_security:");
      expect(source).toContain("category: security.decision.category");
      expect(source).toContain("risk_score: security.decision.risk_score");
      expect(source).toContain("action: security.decision.action");
    }
  });
});
