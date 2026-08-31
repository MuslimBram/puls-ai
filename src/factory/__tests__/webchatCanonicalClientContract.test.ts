import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const validator = read("supabase/functions/_shared/webchat-channel-validator.ts");
const proxy = read("supabase/functions/webchat-proxy/index.ts");
const setup = read("src/components/WebsiteChatSetup.tsx");
const widget = read("public/chat-widget.js");

describe("canonical Website Chat client contract", () => {
  it("requires caller-stable event identity instead of generating a new id for retries", () => {
    expect(validator).toContain('error: "event_id is required"');
    expect(validator).toContain("if (!event_id)");
    expect(validator).not.toContain("Math.random()");
    expect(validator).not.toContain("Date.now()");
    expect(proxy).toContain("event_id,");
  });

  it("ships the embed artifact and reuses one event id when the same send is retried", () => {
    expect(widget).toContain("const createEventId = () => `wc:${crypto.randomUUID()}`");
    expect(widget).toContain('event_id: pendingEventId');
    expect(widget).toContain('pendingMessage !== message');
    expect(widget).toContain('credentials: "omit"');
    expect(widget).toContain('cache: "no-store"');
    expect(widget).not.toMatch(/\buser_id\b/);
    expect(widget).not.toMatch(/\bworkspace_id\b/);
  });

  it("wires setup and test sends to the canonical public proxy with explicit event ids", () => {
    expect(setup).toContain('/functions/v1/webchat-proxy`');
    expect(setup).toContain("/chat-widget.js");
    expect(setup).toContain('event_id: `wc:${crypto.randomUUID()}`');
    expect(setup).not.toContain("https://your-server.example.com/webchat-proxy");
  });
});
