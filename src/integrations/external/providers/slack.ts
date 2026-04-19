import type { IExternalAdapter } from "../types";

/**
 * Slack adapter — posts to a Slack channel via Incoming Webhook.
 */
export const SlackAdapter: IExternalAdapter = {
  key: "slack",

  validateCredentials(credentials) {
    const errors: string[] = [];
    const url = credentials.webhook_url?.trim();
    if (!url) errors.push("Webhook URL is required");
    else if (!/^https:\/\/hooks\.slack\.com\/services\//i.test(url)) {
      errors.push("Webhook URL must start with https://hooks.slack.com/services/");
    }
    return { valid: errors.length === 0, errors };
  },

  async testConnection(credentials) {
    try {
      // Slack returns 400 "no_text" for an empty body — that proves it's reachable.
      const res = await fetch(credentials.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      if (text === "ok" || text.includes("no_text") || text.includes("invalid_payload")) {
        return { success: true, message: "Slack webhook is reachable." };
      }
      return { success: false, message: `Slack responded: ${text}` };
    } catch (e) {
      return { success: false, message: `Network error: ${(e as Error).message}` };
    }
  },

  async fetchData() {
    return { data: null, eventLog: "Slack incoming webhooks are write-only." };
  },

  async pushData(payload: unknown) {
    const { webhook_url, text } = payload as { webhook_url: string; text: string };
    const res = await fetch(webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { success: false, eventLog: `Slack push failed (${res.status}): ${t}` };
    }
    return { success: true, eventLog: "Message posted to Slack." };
  },

  getUsageStats() {
    return { totalCalls: 0, lastCalledAt: null };
  },
};
