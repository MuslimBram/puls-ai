import type { IExternalAdapter } from "../types";
import { DiscordAdapter } from "./discord";
import { SlackAdapter } from "./slack";
import { BlueskyAdapter } from "./bluesky";
import { MastodonAdapter } from "./mastodon";

/**
 * Registry of all real provider adapters keyed by channel_registry.id.
 * Other channels (telegram, whatsapp, instagram, etc.) are handled by their own
 * existing flows and are intentionally not wrapped here yet.
 */
export const REAL_PROVIDERS: Record<string, IExternalAdapter> = {
  discord: DiscordAdapter,
  slack: SlackAdapter,
  bluesky: BlueskyAdapter,
  mastodon: MastodonAdapter,
};

export function getProvider(key: string): IExternalAdapter | undefined {
  return REAL_PROVIDERS[key];
}
