import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { resolveAuthenticatedTelegramChannel } from "../../../supabase/functions/_shared/telegram-workspace-resolver";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);

describe("SOCIAL-0 security correction pass", () => {
  it("score-leads and score-visitors call AI Router with user auth + authorized workspace", () => {
    const scoreLeads = readFileSync(repoFile("supabase", "functions", "score-leads", "index.ts"), "utf-8");
    const scoreVisitors = readFileSync(repoFile("supabase", "functions", "score-visitors", "index.ts"), "utf-8");

    expect(scoreLeads).toContain("callAIRouter(");
    expect(scoreLeads).toContain("authHeader");
    expect(scoreLeads).toContain("workspaceId: workspace_id");
    expect(scoreLeads).not.toContain("ai.gateway.lovable.dev");

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

    expect(webchat).toContain("channel_id and message are required");
    expect(webchat).toContain('.eq("id", channel_id)');
    expect(webchat).toContain("WEBCHAT_TRUSTED_PROXY_BLOCKER");
    expect(webchat).toContain("Channel configuration error");
    expect(webchat).not.toContain("user_id and message are required");

    expect(chatWidget).toContain("server proxy is not configured");
    expect(chatWidget).not.toContain("WEBCHAT_TRUSTED_PROXY_BLOCKER");
    expect(websiteSetup).toContain("data-channel-id");
    expect(websiteSetup).not.toContain("data-user-id");
    expect(chatWidget).not.toContain("INTERNAL_WEBHOOK_SECRET");
    expect(websiteSetup).not.toContain("INTERNAL_WEBHOOK_SECRET");
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
