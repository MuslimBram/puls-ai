/**
 * _shared/webchat-channel-validator.ts
 *
 * Pure, side-effect-free validation logic for the public webchat boundary.
 * Browser input never supplies tenant identity; channel_id resolves the tenant
 * server-side and the request Origin must match a server-stored allowlist.
 */

export type WebchatPublicInput = {
  visitor_name?: unknown;
  visitor_email?: unknown;
  message?: unknown;
  page_url?: unknown;
  channel_id?: unknown;
  event_id?: unknown;
  // Deliberately reject these — they must never come from the browser.
  user_id?: unknown;
  workspace_id?: unknown;
  business_id?: unknown;
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
const MAX_ALLOWED_ORIGINS = 20;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeWebOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(isLocalhost && url.protocol === "http:")) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export type WebchatAllowedOriginsValidation =
  | { ok: true; origins: string[] }
  | { ok: false; error: string };

export function normalizeAllowedWebchatOrigins(value: unknown): WebchatAllowedOriginsValidation {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ALLOWED_ORIGINS) {
    return { ok: false, error: "At least one allowed website origin is required" };
  }

  const origins = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || item.length > 300) {
      return { ok: false, error: "Invalid allowed website origin" };
    }
    const normalized = normalizeWebOrigin(item);
    if (!normalized) return { ok: false, error: "Invalid allowed website origin" };
    origins.add(normalized);
  }

  if (origins.size < 1 || origins.size > MAX_ALLOWED_ORIGINS) {
    return { ok: false, error: "Invalid allowed website origin count" };
  }
  return { ok: true, origins: [...origins] };
}

export function validatePublicWebchatInput(body: WebchatPublicInput): WebchatInputValidation {
  // Tenant identity must never be trusted from a public browser/widget.
  if (body.user_id !== undefined || body.workspace_id !== undefined || body.business_id !== undefined) {
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

  const event_id = typeof body.event_id === "string" ? body.event_id.trim() : "";
  if (!event_id) {
    return { ok: false, status: 400, error: "event_id is required" };
  }
  if (event_id.length < 8 || event_id.length > 200 || !EVENT_ID_PATTERN.test(event_id)) {
    return { ok: false, status: 400, error: "invalid event_id" };
  }

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
  settings?: unknown;
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
  if (!ch.workspace_id || !ch.user_id) {
    return { ok: false, status: 403, error: "Channel configuration error" };
  }

  const allowed = normalizeAllowedWebchatOrigins(asRecord(ch.settings).allowed_origins);
  if (!allowed.ok) {
    return { ok: false, status: 403, error: "Channel configuration error" };
  }

  return {
    ok: true,
    channel: {
      ...ch,
      settings: { ...asRecord(ch.settings), allowed_origins: allowed.origins },
      workspace_id: ch.workspace_id,
      user_id: ch.user_id,
    },
  };
}

export function validateWebchatRequestOrigin(
  settings: unknown,
  requestOrigin: string | null,
): { ok: true; origin: string } | { ok: false; status: number; error: string } {
  if (!requestOrigin) return { ok: false, status: 403, error: "Origin not allowed" };

  const normalizedRequestOrigin = normalizeWebOrigin(requestOrigin);
  if (!normalizedRequestOrigin) return { ok: false, status: 403, error: "Origin not allowed" };

  const allowed = normalizeAllowedWebchatOrigins(asRecord(settings).allowed_origins);
  if (!allowed.ok || !allowed.origins.includes(normalizedRequestOrigin)) {
    return { ok: false, status: 403, error: "Origin not allowed" };
  }

  return { ok: true, origin: normalizedRequestOrigin };
}
