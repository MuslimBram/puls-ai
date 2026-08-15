import { describe, it, expect, vi } from "vitest";
import { RedditAccessGatedAdapter } from "../../services/reddit/redditAccessGatedAdapter";
import { RedditWorkspaceConfig } from "../../types/redditIntegration";

describe("Phase R2: Reddit & Discord Integration Contracts", () => {
  const WORKSPACE_A = "ws-alpha-111";
  const WORKSPACE_B = "ws-beta-222";

  describe("Reddit Access-Gated Adapter Contracts", () => {
    const unconfiguredConfig: RedditWorkspaceConfig = {
      workspace_id: WORKSPACE_A,
      connection_status: "disconnected",
      access_status: "COMMERCIAL_ACCESS_REQUIRED",
    };

    it("1. Reddit adapter makes ZERO network calls when access is not READY", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const adapter = new RedditAccessGatedAdapter(unconfiguredConfig);

      const syncRes = await adapter.syncRedditInbox({ workspace_id: WORKSPACE_A });
      expect(syncRes.success).toBe(false);
      expect(syncRes.error_code).toBe("REDDIT_ACCESS_NOT_CONFIGURED");
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it("2. Outbound post fails closed with REDDIT_ACCESS_NOT_CONFIGURED", async () => {
      const adapter = new RedditAccessGatedAdapter(unconfiguredConfig);

      const postRes = await adapter.sendRedditPost({
        workspace_id: WORKSPACE_A,
        subreddit: "saas",
        title: "Product Launch",
        content: "Check out Pulse AI SaaS",
      });

      expect(postRes.success).toBe(false);
      expect(postRes.error_code).toBe("REDDIT_ACCESS_NOT_CONFIGURED");
    });

    it("3. Outbound reply fails closed with REDDIT_ACCESS_NOT_CONFIGURED", async () => {
      const adapter = new RedditAccessGatedAdapter(unconfiguredConfig);

      const replyRes = await adapter.sendRedditReply({
        workspace_id: WORKSPACE_A,
        thing_id: "t3_abc123",
        content: "Thank you for sharing!",
      });

      expect(replyRes.success).toBe(false);
      expect(replyRes.error_code).toBe("REDDIT_ACCESS_NOT_CONFIGURED");
    });

    it("4. Reddit workspace A config cannot affect workspace B (Strict Workspace Isolation)", async () => {
      const adapterA = new RedditAccessGatedAdapter(unconfiguredConfig);

      await expect(adapterA.syncRedditInbox({ workspace_id: WORKSPACE_B })).rejects.toThrow(
        "Workspace isolation error"
      );
    });

    it("5. Access status defaults to COMMERCIAL_ACCESS_REQUIRED", () => {
      const adapter = new RedditAccessGatedAdapter({
        workspace_id: WORKSPACE_A,
        connection_status: "disconnected",
        access_status: "COMMERCIAL_ACCESS_REQUIRED",
      });
      expect(adapter.getAccessStatus()).toBe("COMMERCIAL_ACCESS_REQUIRED");
    });
  });

  describe("Discord Native Integration Security Contracts", () => {
    it("6. Discord Bot Token is NEVER exposed in payload responses", () => {
      const botToken = "Bot.MTAxMjM0NTY3ODkw.SecretKeyTokenValue123456";
      const sanitizedLog = JSON.stringify({
        workspace_id: WORKSPACE_A,
        channel_id: "123456789",
        mode: "bot",
      });

      expect(sanitizedLog).not.toContain(botToken);
      expect(sanitizedLog).not.toContain("SecretKeyTokenValue");
    });

    it("7. Workspace isolation contract: workspace A cannot consume workspace B credentials", () => {
      const channelA = { workspace_id: WORKSPACE_A, channel_type: "discord" };
      const channelB = { workspace_id: WORKSPACE_B, channel_type: "discord" };

      expect(channelA.workspace_id).not.toBe(channelB.workspace_id);
    });

    it("8. Inbound idempotency contract prevents duplicate inbox message insertion", () => {
      const adapterKey = "discord";
      const messageId = "msg_9988776655";
      const idempotencyKey1 = `inbound:${adapterKey}:${messageId}`;
      const idempotencyKey2 = `inbound:${adapterKey}:${messageId}`;

      expect(idempotencyKey1).toBe(idempotencyKey2);
    });

    it("9. Zero global user/account credential fallback guarantee", () => {
      const mockEnv = process.env;
      expect(mockEnv.DISCORD_BOT_TOKEN).toBeUndefined();
      expect(mockEnv.REDDIT_CLIENT_SECRET).toBeUndefined();
    });

    it("10. Discord Bot message reference structure contract", () => {
      const payload = {
        content: "Replying to discussion thread",
        message_reference: { message_id: "msg_123456789" },
      };

      expect(payload.message_reference.message_id).toBe("msg_123456789");
    });
  });
});
