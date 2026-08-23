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

  for (const channel of channels) {
    const settings = asStringRecord(channel.settings);
    const credentials = asStringRecord(channel.credentials_encrypted);
    const channelPhone = settings.phone_number ?? "";
    if (!channelPhone) continue;

    if (normalize(channelPhone) === normalizedCalled) {
      // Canonical source is credentials_encrypted. Legacy settings fallback is
      // temporary so existing production rows continue working until migration.
      const rawAuthToken = credentials.auth_token || settings.auth_token || "";
      if (!rawAuthToken) continue;

      try {
        const decrypted = await decryptIfNeeded(rawAuthToken);
        if (!decrypted) continue;
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
        continue;
      }
    }
  }

  // Fail closed. A shared environment-level Twilio token cannot safely choose
  // among multiple workspaces. A workspace must be resolved by its configured
  // channel phone number before its credentials are returned.
  return null;
}
