import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decryptIfNeeded, encryptForStorage } from "./token-utils.ts";

export const CALCOM_ENDPOINT_VERSIONS: Record<string, string> = {
  "GET /v2/event-types": "2024-06-14",
  "GET /v2/slots": "2024-09-04",
  "GET /v2/slots/available": "2024-09-04",
  "GET /v2/bookings": "2026-05-01",
  "GET /v2/bookings/{id}": "2026-02-25",
  "GET /v2/bookings/{bookingUid}": "2026-02-25",
  "POST /v2/bookings": "2026-02-25",
  "POST /v2/bookings/{uid}/reschedule": "2026-02-25",
  "POST /v2/bookings/{bookingUid}/reschedule": "2026-02-25",
  "POST /v2/bookings/{uid}/cancel": "2026-02-25",
  "POST /v2/bookings/{bookingUid}/cancel": "2026-02-25",
  "POST /v2/webhooks": "2024-08-13",
};

export function getCalcomEndpointVersion(endpointKey: string): string {
  const version = CALCOM_ENDPOINT_VERSIONS[endpointKey];
  if (!version) {
    throw new Error(`Unmapped Cal.com API v2 endpoint key: ${endpointKey}`);
  }
  return version;
}

export interface DecryptedCalcomCreds {
  access_token?: string;
  refresh_token?: string;
  api_key?: string;
  expires_at?: number;
  webhook_secret?: string;
}

export async function getCalcomWorkspaceCredentials(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string
): Promise<{ accessToken: string; apiKey?: string; creds: DecryptedCalcomCreds }> {
  const { data: channel } = await supabase
    .from("channels")
    .select("id, credentials_encrypted, provider_metadata, connection_status")
    .eq("workspace_id", workspaceId)
    .eq("channel_type", "calcom")
    .eq("connection_status", "connected")
    .maybeSingle();

  if (!channel) {
    throw new Error(`Cal.com integration not connected for workspace ${workspaceId}`);
  }

  let creds: DecryptedCalcomCreds = {};
  if (channel.credentials_encrypted) {
    try {
      const raw = await decryptIfNeeded(channel.credentials_encrypted);
      if (typeof raw === "string" && raw.startsWith("{")) {
        creds = JSON.parse(raw);
      } else if (typeof raw === "string") {
        creds = { api_key: raw };
      }
    } catch {
      throw new Error(`Invalid encrypted credentials format for workspace ${workspaceId}`);
    }
  }

  const metadata = channel.provider_metadata || {};
  let accessToken = creds.access_token ?? metadata.access_token ?? creds.api_key;
  const refreshToken = creds.refresh_token ?? metadata.refresh_token;
  const expiresAt = creds.expires_at ?? metadata.expires_at ?? 0;

  // Check token expiration (if expires in < 60s, trigger refresh)
  const isExpired = expiresAt > 0 && Date.now() / 1000 >= expiresAt - 60;

  if (isExpired && refreshToken) {
    const clientId = Deno.env.get("CALCOM_CLIENT_ID");
    const clientSecret = Deno.env.get("CALCOM_CLIENT_SECRET");

    if (clientId && clientSecret) {
      try {
        // OFFICIAL CAL.COM API v2 OAUTH2 TOKEN ENDPOINT
        const refreshRes = await fetch("https://api.cal.com/v2/auth/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          accessToken = refreshData.access_token;
          const newRefreshToken = refreshData.refresh_token ?? refreshToken;
          const newExpiresAt = Math.floor(Date.now() / 1000) + (refreshData.expires_in ?? 3600);

          const updatedCreds: DecryptedCalcomCreds = {
            ...creds,
            access_token: accessToken,
            refresh_token: newRefreshToken,
            expires_at: newExpiresAt,
          };

          const encryptedNewCreds = await encryptForStorage(JSON.stringify(updatedCreds));

          await supabase
            .from("channels")
            .update({
              credentials_encrypted: encryptedNewCreds,
              provider_metadata: {
                ...metadata,
                expires_at: newExpiresAt,
              },
            })
            .eq("id", channel.id);
        } else {
          await supabase
            .from("channels")
            .update({ connection_status: "reconnect_required" })
            .eq("id", channel.id);
          throw new Error(`Cal.com token refresh failed for workspace ${workspaceId}`);
        }
      } catch (err) {
        await supabase
          .from("channels")
          .update({ connection_status: "reconnect_required" })
          .eq("id", channel.id);
        throw new Error(
          `Cal.com token refresh error for workspace ${workspaceId}: ${err instanceof Error ? err.message : "Unknown"}`
        );
      }
    }
  }

  if (!accessToken) {
    throw new Error(`No active access token or API key found for workspace ${workspaceId}`);
  }

  return { accessToken, apiKey: creds.api_key, creds };
}
