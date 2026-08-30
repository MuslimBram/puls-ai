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

  it("authenticates with the encrypted per-channel webhook secret and never the internal cron secret", () => {
    expect(ingest).toContain('req.headers.get("x-webhook-secret")');
    expect(ingest).toContain("decryptIfNeeded(storedCiphertext)");
    expect(ingest).toContain("secureEqual(storedSecret, presentedSecret)");
    expect(ingest).not.toContain("requireInternalSecret");
    expect(setup).toContain('webhook_secret: secret');
    expect(setup).toContain('"X-Webhook-Secret": sessionSecret');
  });

  it("requires a canonical event id and stores it as provider_message_id", () => {
    expect(ingest).toContain('body.event_id');
    expect(ingest).toContain('error: "event_id required"');
    expect(ingest).toContain("provider_message_id: eventId");
    expect(setup).toContain('"event_id": "evt_unique_from_your_system"');
    expect(setup).not.toContain('"user_id": "YOUR_USER_ID"');
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
