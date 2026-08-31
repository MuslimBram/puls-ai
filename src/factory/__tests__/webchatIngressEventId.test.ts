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
  it("accepts a bounded client event id and generates one for legacy clients", () => {
    expect(validator).toContain("event_id?: unknown");
    expect(validator).toContain('error: "event_id too long"');
    expect(proxy).toContain('event_id || `webchat_${crypto.randomUUID()}`');
    expect(proxy).toContain("event_id: inboundEventId");
  });

  it("requires the internal ingress to receive and persist the canonical event id", () => {
    expect(ingest).toContain('error: "channel_id and message are required"');
    expect(ingest).toContain('error: "event_id is required"');
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
