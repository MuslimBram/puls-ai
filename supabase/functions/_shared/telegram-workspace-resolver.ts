export type TelegramChannelCandidate = {
  id: string;
  workspace_id: string | null;
  user_id: string;
  settings?: Record<string, unknown> | null;
};

export type TelegramChannelResolutionResult =
  | { ok: true; channel: TelegramChannelCandidate }
  | {
      ok: false;
      reason:
        | "secret_not_configured"
        | "channel_id_required"
        | "unauthorized"
        | "channel_not_found"
        | "channel_ambiguous"
        | "secret_ambiguous"
        | "auth_conflict";
    };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function channelSecretCandidates(settings?: Record<string, unknown> | null): string[] {
  const source = settings || {};
  const candidates = [
    source.telegram_secret_token,
    source.secret_token,
    source.webhook_secret,
  ];
  return candidates.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

export function resolveAuthenticatedTelegramChannel(args: {
  channels: TelegramChannelCandidate[];
  secretHeader: string | null;
  configuredGlobalSecret: string | null;
  requestedChannelId: string | null;
}): TelegramChannelResolutionResult {
  const { channels, secretHeader, configuredGlobalSecret, requestedChannelId } = args;
  const trimmedSecret = secretHeader?.trim() || "";
  const trimmedGlobal = configuredGlobalSecret?.trim() || "";

  const hasPerChannelSecretConfig = channels.some((c) => channelSecretCandidates(c.settings).length > 0);
  if (!trimmedGlobal && !hasPerChannelSecretConfig) {
    return { ok: false, reason: "secret_not_configured" };
  }

  const globalAuthOk = Boolean(trimmedGlobal && trimmedSecret && timingSafeEqual(trimmedSecret, trimmedGlobal));
  const perChannelMatches = trimmedSecret
    ? channels.filter((channel) => channelSecretCandidates(channel.settings).some((s) => timingSafeEqual(s, trimmedSecret)))
    : [];

  let globalChannel: TelegramChannelCandidate | null = null;
  if (globalAuthOk) {
    if (!requestedChannelId) return { ok: false, reason: "channel_id_required" };
    const channelMatches = channels.filter((c) => c.id === requestedChannelId);
    if (channelMatches.length === 0) return { ok: false, reason: "channel_not_found" };
    if (channelMatches.length > 1) return { ok: false, reason: "channel_ambiguous" };
    globalChannel = channelMatches[0];
  }

  if (perChannelMatches.length > 1) {
    return { ok: false, reason: "secret_ambiguous" };
  }

  const perChannel = perChannelMatches[0] ?? null;

  if (globalChannel && perChannel && globalChannel.id !== perChannel.id) {
    return { ok: false, reason: "auth_conflict" };
  }

  const chosen = perChannel ?? globalChannel;
  if (!chosen) return { ok: false, reason: "unauthorized" };

  return { ok: true, channel: chosen };
}
