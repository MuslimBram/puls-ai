import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { resolveAuthenticatedTelegramChannel } from "../../../supabase/functions/_shared/telegram-workspace-resolver";
import {
  validatePublicWebchatInput,
  validateWebchatChannel,
} from "../../../supabase/functions/_shared/webchat-channel-validator";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

describe("SOCIAL-0 security correction pass", () => {
  it("score-leads and score-visitors call AI Router with user auth + authorized workspace", () => {
    const scoreLeads = readFileSync(repoFile("supabase", "functions", "score-leads", "index.ts"), "utf-8");
    const scoreVisitors = readFileSync(repoFile("supabase", "functions", "score-visitors", "index.ts"), "utf-8");

    expect(scoreLeads).toContain("callAIRouter(");
    expect(scoreLeads).toContain("authHeader");
    expect(scoreLeads).toContain("workspaceId: workspace_id");
    expect(scoreLeads).not.toContain("ai.gateway.frontend_builder.dev");

    expect(scoreVisitors).toContain("callAIRouter(");
    expect(scoreVisitors).toContain("authHeader");
    expect(scoreVisitors).toContain("workspaceId");
    expect(scoreVisitors).toContain("workspace_id required when multiple workspaces are available");
  });

  it("telegram resolver rejects forged channel_id and wrong secret, and resolves only authenticated unique mappings", () => {
    const channels = [
      {
        id: "ch_1",
        workspace_id: "ws_1",
        user_id: "u_1",
        settings: { telegram_secret_token: "per_secret_1" },
      },
      {
        id: "ch_2",
        workspace_id: "ws_2",
        user_id: "u_2",
        settings: { telegram_secret_token: "per_secret_2" },
      },
    ];

    const forged = resolveAuthenticatedTelegramChannel({
      channels,
      configuredGlobalSecret: null,
      secretHeader: null,
      requestedChannelId: "ch_1",
    });
    expect(forged.ok).toBe(false);

    const wrong = resolveAuthenticatedTelegramChannel({
      channels,
      configuredGlobalSecret: "global_secret",
      secretHeader: "wrong",
      requestedChannelId: "ch_1",
    });
    expect(wrong).toEqual({ ok: false, reason: "unauthorized" });

    const validGlobal = resolveAuthenticatedTelegramChannel({
      channels,
      configuredGlobalSecret: "global_secret",
      secretHeader: "global_secret",
      requestedChannelId: "ch_1",
    });
    expect(validGlobal.ok).toBe(true);
    if (validGlobal.ok) expect(validGlobal.channel.id).toBe("ch_1");

    const validPerChannel = resolveAuthenticatedTelegramChannel({
      channels,
      configuredGlobalSecret: "global_secret",
      secretHeader: "per_secret_2",
      requestedChannelId: null,
    });
    expect(validPerChannel.ok).toBe(true);
    if (validPerChannel.ok) expect(validPerChannel.channel.id).toBe("ch_2");
  });

  it("telegram webhook fails closed on null/ambiguous workspace mapping and claims idempotency before side effects", () => {
    const telegramWebhook = readFileSync(repoFile("supabase", "functions", "telegram-webhook", "index.ts"), "utf-8");

    expect(telegramWebhook).toContain("TELEGRAM_WORKSPACE_MAPPING_BLOCKER");
    expect(telegramWebhook).toContain("if (candidates.size !== 1)");
    expect(telegramWebhook).toContain("idempotencyKey = `tg:");

    const claimIdx = telegramWebhook.indexOf('from("integration_event_logs").insert');
    const aiIdx = telegramWebhook.indexOf("callAIRouter(");
    const leadIdx = telegramWebhook.indexOf('from("leads")');
    expect(claimIdx).toBeGreaterThan(-1);
    expect(aiIdx).toBeGreaterThan(claimIdx);
    expect(leadIdx).toBeGreaterThan(claimIdx);
  });

  it("webchat ingest enforces channel-based server-side tenant resolution and ignores browser user_id authority", () => {
    const webchat = readFileSync(repoFile("supabase", "functions", "webchat-ingest", "index.ts"), "utf-8");
    const chatWidget = readFileSync(repoFile("src", "components", "ChatWidget.tsx"), "utf-8");
    const websiteSetup = readFileSync(repoFile("src", "components", "WebsiteChatSetup.tsx"), "utf-8");
    const webchatProxy = readFileSync(repoFile("supabase", "functions", "webchat-proxy", "index.ts"), "utf-8");
    const configToml = readFileSync(repoFile("supabase", "config.toml"), "utf-8");

    // webchat-ingest: server-side channel resolution; blocker marker removed (proxy now present)
    expect(webchat).toContain("channel_id and message are required");
    expect(webchat).toContain('.eq("id", channel_id)');
    expect(webchat).not.toContain("WEBCHAT_TRUSTED_PROXY_BLOCKER");
    expect(webchat).toContain("Channel configuration error");
    expect(webchat).not.toContain("user_id and message are required");

    // Browser code must never contain the internal secret
    expect(chatWidget).not.toContain("INTERNAL_WEBHOOK_SECRET");
    expect(websiteSetup).not.toContain("INTERNAL_WEBHOOK_SECRET");

    // Browser code must use the proxy URL, not direct ingest
    expect(chatWidget).toContain("server proxy is not configured");
    expect(chatWidget).not.toContain("WEBCHAT_TRUSTED_PROXY_BLOCKER");
    expect(websiteSetup).toContain("data-channel-id");
    expect(websiteSetup).not.toContain("data-user-id");

    // Canonical Supabase gateway contract must explicitly allow both webchat handlers
    expect(configToml).toMatch(/\[functions\.webchat-proxy\]\s+verify_jwt = false/);
    expect(configToml).toMatch(/\[functions\.webchat-ingest\]\s+verify_jwt = false/);

    // webchat-proxy: injects secret server-side; proxy endpoint exists
    expect(webchatProxy).toContain("x-internal-secret");
    expect(webchatProxy).toContain("INTERNAL_WEBHOOK_SECRET");
    expect(webchatProxy).toContain("validatePublicWebchatInput");
    expect(webchatProxy).toContain("validateWebchatChannel");
    // Proxy must not surface internal detail to browser
    expect(webchatProxy).toContain('"Service error"');
    expect(webchatProxy).not.toContain("ingestResp.json()");
  });

  describe("webchat proxy — trusted server-side proxy behavior tests", () => {
    const validChannel = {
      id: "ch_web_1",
      user_id: "u_1",
      workspace_id: "ws_1",
      channel_type: "website_chat",
      is_enabled: true,
    };

    // --- Input validation ---

    it("valid public input passes validation", () => {
      const result = validatePublicWebchatInput({
        channel_id: "ch_web_1",
        message: "Hello, I need help",
        visitor_name: "Alice",
        visitor_email: "alice@example.com",
        page_url: "https://customer.example.com/product",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.channel_id).toBe("ch_web_1");
        expect(result.message).toBe("Hello, I need help");
        expect(result.visitor_name).toBe("Alice");
      }
    });

    it("forged user_id in browser input is rejected — status 400", () => {
      const result = validatePublicWebchatInput({
        channel_id: "ch_web_1",
        message: "Hello",
        user_id: "attacker-user-id",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    });

    it("forged workspace_id in browser input is rejected — status 400", () => {
      const result = validatePublicWebchatInput({
        channel_id: "ch_web_1",
        message: "Hello",
        workspace_id: "attacker-workspace-id",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    });

    it("missing channel_id fails closed — status 400", () => {
      const result = validatePublicWebchatInput({ message: "Hello" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    });

    it("missing message fails closed — status 400", () => {
      const result = validatePublicWebchatInput({ channel_id: "ch_web_1" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    });

    it("message exceeding 5000 characters fails closed — status 400", () => {
      const result = validatePublicWebchatInput({
        channel_id: "ch_web_1",
        message: "x".repeat(5001),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    });

    // --- Channel validation ---

    it("valid channel with workspace passes validation", () => {
      const result = validateWebchatChannel([validChannel], "ch_web_1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.channel.workspace_id).toBe("ws_1");
        expect(result.channel.user_id).toBe("u_1");
      }
    });

    it("missing/unknown channel fails closed — status 403", () => {
      const result = validateWebchatChannel([], "ch_web_1");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });

    it("null channel list fails closed — status 403", () => {
      const result = validateWebchatChannel(null, "ch_web_1");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });

    it("disabled channel fails closed — status 403", () => {
      const result = validateWebchatChannel(
        [{ ...validChannel, is_enabled: false }],
        "ch_web_1",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });

    it("channel with null workspace fails closed — status 403", () => {
      const result = validateWebchatChannel(
        [{ ...validChannel, workspace_id: null }],
        "ch_web_1",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });

    it("channel with wrong channel_type fails closed — status 403", () => {
      const result = validateWebchatChannel(
        [{ ...validChannel, channel_type: "telegram" }],
        "ch_web_1",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });

    it("ambiguous channel mapping (multiple rows) fails closed — status 403", () => {
      const result = validateWebchatChannel(
        [validChannel, { ...validChannel, id: "ch_web_2" }],
        "ch_web_1",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });

    it("cross-workspace: forged channel_id returns error — no write to other workspace", () => {
      // Simulates attacker supplying a channel_id from a different workspace
      const otherWorkspaceChannel = {
        id: "ch_web_other",
        user_id: "u_other",
        workspace_id: "ws_attacker",
        channel_type: "website_chat",
        is_enabled: true,
      };
      // DB lookup is scoped to the requested channel_id; mismatching id is rejected
      const result = validateWebchatChannel([otherWorkspaceChannel], "ch_web_1");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });
  });

  it("meta and whatsapp fail closed on ambiguous provider mapping", () => {
    const metaWebhook = readFileSync(repoFile("supabase", "functions", "meta-webhook", "index.ts"), "utf-8");
    const whatsappWebhook = readFileSync(repoFile("supabase", "functions", "whatsapp-webhook", "index.ts"), "utf-8");

    expect(metaWebhook).toContain('if (matches.length > 1) return "AMBIGUOUS"');
    expect(metaWebhook).toContain("Ambiguous Instagram mapping");
    expect(metaWebhook).toContain("Ambiguous Facebook mapping");

    expect(whatsappWebhook).toContain("const matches = (channels ?? []).filter");
    expect(whatsappWebhook).toContain("if (matches.length > 1)");
    expect(whatsappWebhook).toContain("Ambiguous channel mapping for phone_number_id");
  });
});
