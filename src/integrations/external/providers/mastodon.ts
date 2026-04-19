import type { IExternalAdapter } from "../types";

/**
 * Mastodon adapter — publishes statuses to any instance using a per-user access token.
 */
export const MastodonAdapter: IExternalAdapter = {
  key: "mastodon",

  validateCredentials(credentials) {
    const errors: string[] = [];
    const instance = credentials.instance_url?.trim();
    if (!instance) errors.push("Instance URL is required");
    else if (!/^https:\/\//i.test(instance)) errors.push("Instance URL must start with https://");
    if (!credentials.access_token?.trim()) errors.push("Access token is required");
    return { valid: errors.length === 0, errors };
  },

  async testConnection(credentials) {
    try {
      const base = credentials.instance_url.replace(/\/+$/, "");
      const res = await fetch(`${base}/api/v1/accounts/verify_credentials`, {
        headers: { Authorization: `Bearer ${credentials.access_token}` },
      });
      if (res.ok) {
        const me = await res.json();
        return { success: true, message: `Connected as @${me.username}@${new URL(base).host}` };
      }
      return { success: false, message: `Mastodon responded ${res.status}` };
    } catch (e) {
      return { success: false, message: `Network error: ${(e as Error).message}` };
    }
  },

  async fetchData() {
    return { data: null, eventLog: "Mastodon read endpoints not implemented yet." };
  },

  async pushData(payload: unknown) {
    const { instance_url, access_token, status, visibility } = payload as {
      instance_url: string;
      access_token: string;
      status: string;
      visibility?: "public" | "unlisted" | "private" | "direct";
    };
    const base = instance_url.replace(/\/+$/, "");
    const res = await fetch(`${base}/api/v1/statuses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({ status, visibility: visibility || "public" }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { success: false, eventLog: `Mastodon post failed (${res.status}): ${t}` };
    }
    return { success: true, eventLog: "Toot posted to Mastodon." };
  },

  getUsageStats() {
    return { totalCalls: 0, lastCalledAt: null };
  },
};
