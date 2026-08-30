import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const proxy = readFileSync(
  resolve(process.cwd(), "supabase/functions/webchat-proxy/index.ts"),
  "utf8",
);
const ingest = readFileSync(
  resolve(process.cwd(), "supabase/functions/webchat-ingest/index.ts"),
  "utf8",
);
const validator = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/webchat-channel-validator.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260830193500_webchat_ingress_idempotency.sql"),
  "utf8",
);

describe("P0.6 webchat canonical event id", () => {
  it("requires a bounded retry-stable client event id and never invents one in the proxy", () => {
    expect(validator).toContain("event_id?: unknown");
    expect(validator).toContain('error: "event_id is required"');
    expect(validator).toContain('error: "invalid event_id"');
    expect(validator).toContain("event_id.length < 8 || event_id.length > 200");
    expect(validator).toContain("EVENT_ID_PATTERN.test(event_id)");
    expect(proxy).not.toContain("crypto.randomUUID()");
    expect(proxy).not.toContain("event_id ||");
    expect(proxy).toContain("event_id,");
  });

  it("requires the internal ingress to receive and persist the canonical event id", () => {
    expect(ingest).toContain('error: "channel_id, event_id and message are required"');
    expect(ingest).toContain("provider_message_id: eventId");
    expect(ingest).toContain("external_event_id: eventId");
    expect(ingest).toContain('inboxErr.code === "23505"');
  });

  it("keeps tenant identity server-side", () => {
    expect(proxy).toContain('.eq("channel_type", "website_chat")');
    expect(ingest).toContain("const workspaceId = channel.workspace_id");
    expect(ingest).toContain("const userId = channel.user_id");
    expect(validator).toContain("user_id and workspace_id must never be trusted from the browser");
  });

  it("adds a race-safe unique boundary scoped only to website chat", () => {
    expect(migration).toContain("inbox_messages_webchat_event_unique");
    expect(migration).toContain("(workspace_id, channel_id, provider_message_id)");
    expect(migration).toContain("where channel_type = 'website_chat'");
    expect(migration).toContain("having count(*) > 1");
  });
});
