import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ingest = readFileSync(
  resolve(process.cwd(), "supabase/functions/webhook-ingest/index.ts"),
  "utf8",
);
const setup = readFileSync(
  resolve(process.cwd(), "src/components/WebhookSetup.tsx"),
  "utf8",
);
const channels = readFileSync(
  resolve(process.cwd(), "src/hooks/useChannels.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260830193000_custom_webhook_ingress_idempotency.sql"),
  "utf8",
);

describe("P0.6 custom webhook ingress boundary", () => {
  it("derives tenant identity from the canonical channel instead of caller-supplied user/workspace ids", () => {
    expect(ingest).toContain('.eq("channel_type", "custom_webhook")');
    expect(ingest).toContain("const workspaceId = String(channel.workspace_id)");
    expect(ingest).toContain("const userId = String(channel.user_id)");
    expect(ingest).not.toMatch(/const\s*\{[^}]*user_id[^}]*\}\s*=\s*body/);
    expect(ingest).not.toMatch(/const\s*\{[^}]*workspace_id[^}]*\}\s*=\s*body/);
  });

  it("requires timestamped HMAC-SHA256 rather than replayable bearer-secret authentication", () => {
    expect(ingest).toContain("const SIGNATURE_WINDOW_SECONDS = 300");
    expect(ingest).toContain('req.headers.get("x-webhook-event-id")');
    expect(ingest).toContain('req.headers.get("x-webhook-timestamp")');
    expect(ingest).toContain('req.headers.get("x-webhook-signature")');
    expect(ingest).toContain("{ name: \"HMAC\", hash: \"SHA-256\" }");
    expect(ingest).toContain('const signingPayload = `${timestampHeader}.${eventId}.${rawBody}`');
    expect(ingest).toContain("Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_WINDOW_SECONDS");
    expect(ingest).toContain("secureEqualHex(expectedSignature, signatureMatch[1].toLowerCase())");
    expect(ingest).toContain("decryptIfNeeded(storedCiphertext)");
    expect(ingest).not.toContain('req.headers.get("x-webhook-secret")');
    expect(ingest).not.toContain("requireInternalSecret");
  });

  it("binds the signature to exact raw JSON bytes and header/body event-id parity", () => {
    const rawBodyRead = ingest.indexOf("const rawBody = await req.text()");
    const jsonParse = ingest.indexOf("JSON.parse(rawBody)");
    const signing = ingest.indexOf('const signingPayload = `${timestampHeader}.${eventId}.${rawBody}`');
    expect(rawBodyRead).toBeGreaterThan(-1);
    expect(jsonParse).toBeGreaterThan(rawBodyRead);
    expect(signing).toBeGreaterThan(jsonParse);
    expect(ingest).toContain("if (bodyEventId !== eventId)");
    expect(ingest).toContain('error: "Body event_id must match X-Webhook-Event-Id"');
    expect(ingest).toContain("EVENT_ID_PATTERN");
    expect(ingest).toContain("provider_message_id: eventId");
  });

  it("uses channel_id only as endpoint routing and never trusts channel/user/workspace from signed body", () => {
    expect(ingest).toContain('const channelId = boundedString(url.searchParams.get("channel_id"), 64)');
    expect(ingest).not.toContain('url.searchParams.get("channel_id") || body.channel_id');
    expect(ingest).not.toMatch(/body\.user_id|body\.workspace_id/);
  });

  it("documents and generates the exact HMAC v1 contract in the setup UI", () => {
    expect(setup).toContain("async function hmacSha256Hex");
    expect(setup).toContain('"X-Webhook-Timestamp": timestamp');
    expect(setup).toContain('"X-Webhook-Event-Id": eventId');
    expect(setup).toContain('"X-Webhook-Signature": `v1=${signature}`');
    expect(setup).toContain('const signingPayload = `${timestamp}.${eventId}.${rawBody}`');
    expect(setup).toContain("Replay window: 5 minutes");
    expect(setup).toContain("Never send the secret itself in a request header");
    expect(setup).not.toContain('"X-Webhook-Secret": sessionSecret');
    expect(setup).toContain('webhook_secret: secret');
  });

  it("uses a race-safe unique boundary scoped only to custom webhooks", () => {
    expect(migration).toContain("inbox_messages_custom_webhook_event_unique");
    expect(migration).toContain("(workspace_id, channel_id, provider_message_id)");
    expect(migration).toContain("where channel_type = 'custom_webhook'");
    expect(migration).toContain("having count(*) > 1");
    expect(ingest).toContain('inboxError.code === "23505"');
  });

  it("keeps webhook credentials out of browser channel reads and returns only the saved channel id", () => {
    expect(channels).toContain("browser never writes settings/credentials_encrypted directly");
    expect(channels).toContain("channel_id: String(data.channel_id)");
    expect(channels).toContain("configured_credential_keys");
    expect(setup).toContain("Stored encrypted — rotate to reveal a new secret once.");
  });
});
