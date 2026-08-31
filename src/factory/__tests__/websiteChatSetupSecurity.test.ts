import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20260831014500_website_chat_channel_setup.sql");
const validator = read("supabase/functions/_shared/webchat-channel-validator.ts");
const proxy = read("supabase/functions/webchat-proxy/index.ts");
const manager = read("supabase/functions/website-chat-manage/index.ts");
const config = read("supabase/config.toml");
const setupDialog = read("src/components/channels/WebsiteChatSetupDialog.tsx");
const channelsPage = read("src/pages/Channels.tsx");
const widget = read("public/pulse-webchat.js");

describe("Website Chat secure setup contract", () => {
  it("restores the canonical website_chat registry entry as a live professional web channel", () => {
    expect(migration).toContain("'website_chat'");
    expect(migration).toContain("'Website Chat'");
    expect(migration).toContain("'web'");
    expect(migration).toContain("'live'");
    expect(migration).toContain("'[\"professional\"]'::jsonb");
    expect(migration).toContain("'[\"messaging\",\"inbox\",\"notifications\"]'::jsonb");
    expect(migration).toContain("on conflict (id) do update");
  });

  it("rejects browser-supplied tenant identity and requires a stable event id", () => {
    expect(validator).toContain("body.user_id !== undefined");
    expect(validator).toContain("body.workspace_id !== undefined");
    expect(validator).toContain("body.business_id !== undefined");
    expect(validator).toContain('error: "event_id is required"');
    expect(validator).toContain("EVENT_ID_PATTERN");
  });

  it("requires exact server-stored allowed origins before proxying to ingest", () => {
    expect(validator).toContain("normalizeAllowedWebchatOrigins");
    expect(validator).toContain("validateWebchatRequestOrigin");
    expect(validator).toContain('url.protocol !== "https:"');
    expect(validator).toContain("allowed.origins.includes(normalizedRequestOrigin)");

    expect(proxy).toContain('.select("id, user_id, workspace_id, channel_type, is_enabled, settings")');
    expect(proxy).toContain("req.headers.get(\"origin\")");
    const originCheck = proxy.indexOf("const originResult = validateWebchatRequestOrigin");
    const ingestCall = proxy.indexOf("const ingestUrl =");
    expect(originCheck).toBeGreaterThan(-1);
    expect(ingestCall).toBeGreaterThan(originCheck);
  });

  it("keeps Website Chat management JWT/workspace-bound and enforces the canonical channel limit", () => {
    expect(config).toContain("[functions.website-chat-manage]");
    expect(config).toMatch(/\[functions\.website-chat-manage\]\s+verify_jwt\s*=\s*true/);
    expect(manager).toContain('authHeader.startsWith("Bearer ")');
    expect(manager).toContain('admin.rpc("is_workspace_member"');
    expect(manager).toContain('.eq("owner_id", user.id)');
    expect(manager).toContain("enforceChannelLimit(authHeader)");
    expect(manager).toContain('body: JSON.stringify({ action: "add", resource: "channels" })');
    expect(manager).toContain('channel_type: "website_chat"');
    expect(manager).toContain("credentials_encrypted: {}");
    expect(manager).toContain("settings: { allowed_origins: normalized.origins }");
  });

  it("exposes only safe Website Chat status needed by the setup UI", () => {
    expect(manager).toContain('if (action === "status")');
    expect(manager).toContain("allowed_origins: normalized.ok ? normalized.origins : []");
    expect(manager).not.toContain("credentials_encrypted: existing");
    expect(manager).not.toContain("serviceKey,");
  });

  it("generates an installable widget without tenant ids or internal credentials", () => {
    expect(widget).toContain("script.dataset.channelId");
    expect(widget).toContain("script.dataset.endpoint");
    expect(widget).toContain("channel_id: channelId");
    expect(widget).toContain("event_id: eventId");
    expect(widget).toContain("message,");
    expect(widget).toContain("page_url:");
    expect(widget).not.toContain("workspace_id");
    expect(widget).not.toContain("user_id");
    expect(widget).not.toContain("business_id");
    expect(widget).not.toContain("x-internal-secret");
    expect(widget).not.toContain("Authorization");
    expect(widget).not.toContain("apikey");
  });

  it("uses the dedicated setup flow from the channel catalog and never puts secrets in the snippet", () => {
    expect(channelsPage).toContain('item.id === "website_chat"');
    expect(channelsPage).toContain("<WebsiteChatSetupDialog");
    expect(channelsPage).toContain('ch.channel_type === "website_chat"');

    expect(setupDialog).toContain('supabase.functions.invoke("website-chat-manage"');
    expect(setupDialog).toContain('data-channel-id="${escapeAttribute(channelId)}"');
    expect(setupDialog).toContain('data-endpoint="${escapeAttribute(proxyEndpoint)}"');
    expect(setupDialog).not.toContain("x-internal-secret");
    expect(setupDialog).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
