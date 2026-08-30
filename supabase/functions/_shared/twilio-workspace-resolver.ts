/**
 * _shared/twilio-workspace-resolver.ts
 *
 * Resolves the correct workspace + decrypted Twilio auth token from the
 * called phone number (To/Called field in signed Twilio POST body).
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { decryptIfNeeded } from "./token-utils.ts";

export interface WorkspaceCredentials {
  workspace_id: string;
  channel_id: string;
  user_id: string;
  account_sid: string;
  decrypted_auth_token: string;
  phone_number: string;
  settings: Record<string, string>;
}

export function extractCalledNumber(rawBody: string, contentType: string): string | null {
  if (!contentType.includes("application/x-www-form-urlencoded") || !rawBody) return null;
  const params = new URLSearchParams(rawBody);
  return params.get("To") ?? params.get("Called") ?? null;
}

function asStringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") result[key] = item;
  }
  return result;
}

function safeSettings(settings: Record<string, string>): Record<string, string> {
  const { auth_token: _authToken, api_key_secret: _apiKeySecret, ...safe } = settings;
  return safe;
}

export async function resolveWorkspaceFromCalledNumber(
  calledNumber: string | null,
  channelTypes: string[],
  sb: ReturnType<typeof createClient>,
): Promise<WorkspaceCredentials | null> {
  if (!calledNumber) return null;

  const normalize = (n: string) => n.replace(/[\s\-()]/g, "");
  const normalizedCalled = normalize(calledNumber);

  const { data: channels } = await sb
    .from("channels")
    .select("id, user_id, workspace_id, settings, credentials_encrypted")
    .in("channel_type", channelTypes)
    .eq("is_enabled", true);

  if (!channels?.length) return null;

  const matches = channels.filter((channel) => {
    const settings = asStringRecord(channel.settings);
    const channelPhone = settings.phone_number ?? "";
    return Boolean(channelPhone) && normalize(channelPhone) === normalizedCalled;
  });

  // Fail closed on duplicate tenant mappings. A phone number is an authoritative
  // tenant-routing key only when it resolves to exactly one enabled channel.
  if (matches.length !== 1) {
    if (matches.length > 1) {
      console.error(`[resolver] Ambiguous Twilio phone mapping for ${normalizedCalled}: ${matches.length} enabled channels`);
    }
    return null;
  }

  const channel = matches[0];
  if (!channel.workspace_id) {
    console.error(`[resolver] Twilio channel ${channel.id} is not linked to a workspace`);
    return null;
  }

  const settings = asStringRecord(channel.settings);
  const credentials = asStringRecord(channel.credentials_encrypted);
  const channelPhone = settings.phone_number ?? "";

  // Canonical source is credentials_encrypted. Legacy settings fallback is
  // temporary so existing production rows continue working until migration.
  const rawAuthToken = credentials.auth_token || settings.auth_token || "";
  if (!rawAuthToken) return null;

  try {
    const decrypted = await decryptIfNeeded(rawAuthToken);
    if (!decrypted) return null;
    return {
      workspace_id: channel.workspace_id,
      channel_id: channel.id,
      user_id: channel.user_id,
      account_sid: settings.account_sid ?? "",
      decrypted_auth_token: decrypted,
      phone_number: channelPhone,
      settings: safeSettings(settings),
    };
  } catch {
    console.error(`[resolver] Failed to decrypt auth_token for channel ${channel.id}`);
    return null;
  }
}