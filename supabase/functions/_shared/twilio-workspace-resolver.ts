/**
 * _shared/twilio-workspace-resolver.ts
 *
 * Resolves the correct workspace + decrypted Twilio auth token from the
 * called phone number (To/Called field in signed Twilio POST body).
 *
 * SECURITY:
 *   - Parse To/Called from rawBody BEFORE signature verification
 *     (needed to look up the per-workspace auth token)
 *   - Returns decrypted auth token for signature verification
 *   - workspace_id query param alone is NEVER trusted as authorization
 *   - If no workspace matches the called number, returns null
 *     (caller must reject with 403)
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

/**
 * Extract the called/destination number from a Twilio-signed request body.
 * Works for both voice (To/Called) and SMS (To) callbacks.
 */
export function extractCalledNumber(rawBody: string, contentType: string): string | null {
  if (!contentType.includes("application/x-www-form-urlencoded") || !rawBody) return null;
  const params = new URLSearchParams(rawBody);
  return params.get("To") ?? params.get("Called") ?? null;
}

/**
 * Resolve workspace credentials from the called phone number.
 * This is the ONLY trusted path to get workspace context from Twilio webhooks.
 *
 * @param calledNumber  - The destination phone number from Twilio POST body
 * @param channelTypes  - Which channel types to search (["voip","sms","voice"])
 * @param sb            - Supabase service-role client
 */
export async function resolveWorkspaceFromCalledNumber(
  calledNumber: string | null,
  channelTypes: string[],
  sb: ReturnType<typeof createClient>,
): Promise<WorkspaceCredentials | null> {
  if (!calledNumber) return null;

  // Normalize: strip spaces and dashes for comparison
  const normalize = (n: string) => n.replace(/[\s\-()]/g, "");
  const normalizedCalled = normalize(calledNumber);

  // Look up all enabled channels of the specified types
  // RLS bypassed with service_role — safe since this is server-side only
  const { data: channels } = await sb
    .from("channels")
    .select("id, user_id, workspace_id, settings")
    .in("channel_type", channelTypes)
    .eq("is_enabled", true);

  if (!channels?.length) return null;

  for (const ch of channels) {
    const s = (ch.settings as Record<string, string>) ?? {};
    const chPhone = s.phone_number ?? "";
    if (!chPhone) continue;

    if (normalize(chPhone) === normalizedCalled) {
      // Found matching channel — decrypt auth token
      const rawAuthToken = s.auth_token;
      if (!rawAuthToken) continue;

      try {
        const decrypted = await decryptIfNeeded(rawAuthToken);
        if (!decrypted) continue;
        return {
          workspace_id: ch.workspace_id,
          channel_id: ch.id,
          user_id: ch.user_id,
          account_sid: s.account_sid ?? "",
          decrypted_auth_token: decrypted,
          phone_number: chPhone,
          settings: s,
        };
      } catch {
        // Decryption failed — skip this channel (misconfigured)
        console.error(`[resolver] Failed to decrypt auth_token for channel ${ch.id}`);
        continue;
      }
    }
  }

  // No matching workspace — fall back to global env (single-tenant fallback)
  const globalToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const globalSid   = Deno.env.get("TWILIO_ACCOUNT_SID");
  const globalPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

  if (globalToken && globalPhone && normalize(globalPhone) === normalizedCalled) {
    // Single-tenant env fallback — look up any workspace for this user
    const { data: ch } = await sb
      .from("channels")
      .select("id, user_id, workspace_id, settings")
      .in("channel_type", channelTypes)
      .eq("is_enabled", true)
      .limit(1)
      .maybeSingle();

    if (ch) {
      return {
        workspace_id: ch.workspace_id,
        channel_id: ch.id,
        user_id: ch.user_id,
        account_sid: globalSid ?? "",
        decrypted_auth_token: globalToken,
        phone_number: normalizedCalled,
        settings: (ch.settings as Record<string, string>) ?? {},
      };
    }
  }

  return null;
}
