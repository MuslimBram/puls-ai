import type { IExternalAdapter } from "../types";

/**
 * Discord adapter — posts messages to a Discord channel via incoming webhook.
 * Uses the public webhook endpoint, no OAuth required.
 */
export const DiscordAdapter: IExternalAdapter = {
  key: "discord",

  validateCredentials(credentials) {
    const errors: string[] = [];
    const url = credentials.webhook_url?.trim();
    if (!url) errors.push("Webhook URL is required");
    else if (!/^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/webhooks\//i.test(url)) {
      errors.push("Webhook URL must point to discord.com/api/webhooks/...");
    }
    return { valid: errors.length === 0, errors };
  },

  async testConnection(credentials) {
    try {
      const res = await fetch(credentials.webhook_url, { method: "GET" });
      if (res.ok) return { success: true, message: "Discord webhook is reachable." };
      return { success: false, message: `Discord responded with ${res.status}.` };
    } catch (e) {
      return { success: false, message: `Network error: ${(e as Error).message}` };
    }
  },

  async fetchData() {
    return { data: null, eventLog: "Discord webhooks are write-only." };
  },

  async pushData(payload: unknown) {
    const { webhook_url, content, username } = payload as {
      webhook_url: string;
      content: string;
      username?: string;
    };
    const res = await fetch(webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, username }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, eventLog: `Discord push failed (${res.status}): ${text}` };
    }
    return { success: true, eventLog: "Message posted to Discord." };
  },

  getUsageStats() {
    return { totalCalls: 0, lastCalledAt: null };
  },
};
