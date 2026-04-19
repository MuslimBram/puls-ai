import type { IExternalAdapter } from "../types";

/**
 * Bluesky adapter — publishes posts via the AT Protocol (com.atproto.server.createSession +
 * com.atproto.repo.createRecord). Uses an app password, not the main account password.
 */
const PDS = "https://bsky.social";

export const BlueskyAdapter: IExternalAdapter = {
  key: "bluesky",

  validateCredentials(credentials) {
    const errors: string[] = [];
    if (!credentials.handle?.trim()) errors.push("Handle is required (e.g. you.bsky.social)");
    if (!credentials.app_password?.trim()) errors.push("App password is required");
    return { valid: errors.length === 0, errors };
  },

  async testConnection(credentials) {
    try {
      const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: credentials.handle,
          password: credentials.app_password,
        }),
      });
      if (res.ok) return { success: true, message: "Logged in to Bluesky." };
      const err = await res.json().catch(() => ({}));
      return { success: false, message: err.message || `Login failed (${res.status})` };
    } catch (e) {
      return { success: false, message: `Network error: ${(e as Error).message}` };
    }
  },

  async fetchData() {
    return { data: null, eventLog: "Bluesky read endpoints not implemented yet." };
  },

  async pushData(payload: unknown) {
    const { handle, app_password, text } = payload as {
      handle: string;
      app_password: string;
      text: string;
    };
    const session = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: app_password }),
    });
    if (!session.ok) return { success: false, eventLog: `Bluesky login failed (${session.status})` };
    const { accessJwt, did } = await session.json();

    const post = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessJwt}` },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record: { text, createdAt: new Date().toISOString() },
      }),
    });
    if (!post.ok) {
      const t = await post.text();
      return { success: false, eventLog: `Bluesky post failed (${post.status}): ${t}` };
    }
    return { success: true, eventLog: "Posted to Bluesky." };
  },

  getUsageStats() {
    return { totalCalls: 0, lastCalledAt: null };
  },
};
