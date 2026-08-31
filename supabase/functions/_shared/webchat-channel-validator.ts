/**
 * _shared/webchat-channel-validator.ts
 *
 * Pure, side-effect-free validation logic for the webchat-proxy endpoint.
 * Extracted so it can be unit-tested without a Deno runtime.
 */

export type WebchatPublicInput = {
  visitor_name?: unknown;
  visitor_email?: unknown;
  message?: unknown;
  page_url?: unknown;
  channel_id?: unknown;
  event_id?: unknown;
  // Deliberately reject these — they must never come from the browser
  user_id?: unknown;
  workspace_id?: unknown;
};

export type WebchatInputValidation =
  | {
      ok: true;
      channel_id: string;
      message: string;
      event_id: string;
      visitor_name?: string;
      visitor_email?: string;
      page_url?: string;
    }
  | { ok: false; status: number; error: string };

const EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]+$/;

export function validatePublicWebchatInput(body: WebchatPublicInput): WebchatInputValidation {
  // user_id and workspace_id must never be trusted from the browser
  if (body.user_id !== undefined || body.workspace_id !== undefined) {
    return { ok: false, status: 400, error: "Invalid request parameters" };
  }

  const channel_id = typeof body.channel_id === "string" ? body.channel_id.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!channel_id || !message) {
    return { ok: false, status: 400, error: "channel_id and message are required" };
  }

  if (message.length > 5000) {
    return { ok: false, status: 400, error: "Message too long" };
  }

  const rawEventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
  if (rawEventId && (rawEventId.length < 8 || rawEventId.length > 200 || !EVENT_ID_PATTERN.test(rawEventId))) {
    return { ok: false, status: 400, error: "invalid event_id" };
  }
  // event_id is optional from the browser; the proxy generates a stable one server-side if absent
  const event_id = rawEventId || `wc:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  const visitor_name = typeof body.visitor_name === "string" ? body.visitor_name.trim().slice(0, 200) || undefined : undefined;
  const visitor_email = typeof body.visitor_email === "string" ? body.visitor_email.trim().slice(0, 320) || undefined : undefined;
  const page_url = typeof body.page_url === "string" ? body.page_url.trim().slice(0, 2048) || undefined : undefined;

  return { ok: true, channel_id, message, event_id, visitor_name, visitor_email, page_url };
}

export type WebchatChannelRow = {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  channel_type: string;
  is_enabled: boolean;
};

export type WebchatChannelValidation =
  | { ok: true; channel: WebchatChannelRow & { workspace_id: string; user_id: string } }
  | { ok: false; status: number; error: string };

export function validateWebchatChannel(
  rows: WebchatChannelRow[] | null,
  requestedChannelId: string,
): WebchatChannelValidation {
  if (!rows || rows.length === 0) {
    return { ok: false, status: 403, error: "Invalid channel" };
  }
  if (rows.length > 1) {
    return { ok: false, status: 403, error: "Ambiguous channel mapping" };
  }

  const ch = rows[0];

  if (ch.id !== requestedChannelId) {
    return { ok: false, status: 403, error: "Invalid channel" };
  }
  if (ch.channel_type !== "website_chat") {
    return { ok: false, status: 403, error: "Invalid channel" };
  }
  if (!ch.is_enabled) {
    return { ok: false, status: 403, error: "Channel disabled" };
  }
  if (!ch.workspace_id) {
    return { ok: false, status: 403, error: "Channel configuration error" };
  }
  if (!ch.user_id) {
    return { ok: false, status: 403, error: "Channel configuration error" };
  }

  return {
    ok: true,
    channel: { ...ch, workspace_id: ch.workspace_id, user_id: ch.user_id },
  };
}
