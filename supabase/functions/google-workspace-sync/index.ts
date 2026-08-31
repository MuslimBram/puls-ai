import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { getServiceKey } from "../_shared/admin-client.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";

const getCors = (req: Request) => buildCorsHeaders(req);
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

type GoogleWorkspaceConnection = {
  id: string;
  credentials_encrypted: Record<string, unknown> | null;
  config_json: Record<string, unknown> | null;
};

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

async function getGoogleToken(serviceAccountJson: string, scopes: string[]): Promise<string> {
  let key: ServiceAccountKey;
  try {
    key = JSON.parse(serviceAccountJson) as ServiceAccountKey;
  } catch {
    throw new Error("Invalid Google Workspace service account JSON");
  }

  if (!key.client_email || !key.private_key) {
    throw new Error("Google Workspace service account is missing client_email/private_key");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: key.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${enc(header)}.${enc(payload)}`;

  const pemBody = key.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${sigB64}`,
    }),
  });

  const tokenData = await tokenResponse.json() as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(`Google Workspace authentication failed: ${tokenData.error ?? tokenResponse.status}`);
  }
  return tokenData.access_token;
}

async function resolveWorkspaceConnection(
  admin: ReturnType<typeof createClient>,
  userId: string,
  workspaceId: string,
): Promise<GoogleWorkspaceConnection> {
  const { data: allowed, error: authorizationError } = await admin.rpc("has_workspace_role_for_user", {
    _user_id: userId,
    _workspace_id: workspaceId,
    _roles: ["owner", "admin"],
  });
  if (authorizationError) throw authorizationError;
  if (!allowed) throw new Error("FORBIDDEN_WORKSPACE");

  const { data: connection, error: connectionError } = await admin
    .from("unified_connections")
    .select("id, credentials_encrypted, config_json")
    .eq("workspace_id", workspaceId)
    .eq("provider", "google_workspace")
    .eq("status", "connected")
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) throw new Error("GOOGLE_WORKSPACE_NOT_CONNECTED");

  return connection as GoogleWorkspaceConnection;
}

async function getServiceAccountJson(connection: GoogleWorkspaceConnection): Promise<string> {
  const encrypted = connection.credentials_encrypted ?? {};
  const raw = encrypted.service_account_json;
  if (typeof raw !== "string" || !raw) {
    throw new Error("GOOGLE_WORKSPACE_CREDENTIALS_MISSING");
  }
  return decryptIfNeeded(raw);
}

async function writeSyncLog(
  admin: ReturnType<typeof createClient>,
  workspaceId: string,
  syncType: string,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  const { error } = await admin.from("google_sync_log").insert({
    workspace_id: workspaceId,
    sync_type: syncType,
    status,
    details,
  });
  if (error) console.error("google_sync_log write failed", error.message);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    getServiceKey(),
    { auth: { persistSession: false } },
  );
  const { data: authData, error: authError } = await admin.auth.getUser(authHeader.slice(7));
  if (authError || !authData.user) return json(req, { error: "Unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "JSON body required" }, 400);
  }

  const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id : "";
  if (!workspaceId) return json(req, { error: "workspace_id is required" }, 400);

  let connection: GoogleWorkspaceConnection;
  let serviceAccountJson: string;
  try {
    connection = await resolveWorkspaceConnection(admin, authData.user.id, workspaceId);
    serviceAccountJson = await getServiceAccountJson(connection);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Workspace setup error";
    if (message === "FORBIDDEN_WORKSPACE") return json(req, { error: "Forbidden" }, 403);
    if (message === "GOOGLE_WORKSPACE_NOT_CONNECTED" || message === "GOOGLE_WORKSPACE_CREDENTIALS_MISSING") {
      return json(req, {
        error: "Google Workspace is not connected for this workspace",
        code: message,
      }, 400);
    }
    console.error("google-workspace-sync setup error", message);
    return json(req, { error: "Google Workspace setup failed" }, 500);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "sync_drive";
  const config = connection.config_json ?? {};

  try {
    if (action === "sync_drive") {
      const token = await getGoogleToken(serviceAccountJson, ["https://www.googleapis.com/auth/drive.readonly"]);
      const folderId = typeof body.folder_id === "string"
        ? body.folder_id
        : typeof config.folder_id === "string"
          ? config.folder_id
          : "";
      const query = folderId ? `'${folderId}' in parents and trashed=false` : "trashed=false";
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json() as { files?: Array<Record<string, string>>; error?: unknown };
      if (!response.ok) throw new Error(`Google Drive API returned ${response.status}`);
      const files = data.files ?? [];
      await writeSyncLog(admin, workspaceId, "drive_list_files", "success", {
        connection_id: connection.id,
        items_synced: files.length,
      });
      return json(req, { success: true, files_found: files.length, files: files.slice(0, 20) });
    }

    if (action === "sync_calendar") {
      const token = await getGoogleToken(serviceAccountJson, ["https://www.googleapis.com/auth/calendar.readonly"]);
      const calendarId = typeof body.calendar_id === "string"
        ? body.calendar_id
        : typeof config.calendar_id === "string"
          ? config.calendar_id
          : "primary";
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&orderBy=startTime&singleEvents=true&maxResults=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json() as { items?: Array<Record<string, unknown>> };
      if (!response.ok) throw new Error(`Google Calendar API returned ${response.status}`);
      const events = data.items ?? [];
      await writeSyncLog(admin, workspaceId, "calendar_list_events", "success", {
        connection_id: connection.id,
        items_synced: events.length,
      });
      return json(req, { success: true, events_found: events.length, events });
    }

    if (action === "create_event") {
      const startsAt = typeof body.starts_at === "string" ? body.starts_at : "";
      const endsAt = typeof body.ends_at === "string" ? body.ends_at : "";
      if (!startsAt || !endsAt) return json(req, { error: "starts_at and ends_at are required" }, 400);

      const token = await getGoogleToken(serviceAccountJson, ["https://www.googleapis.com/auth/calendar"]);
      const calendarId = typeof body.calendar_id === "string"
        ? body.calendar_id
        : typeof config.calendar_id === "string"
          ? config.calendar_id
          : "primary";
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: body.title ?? "Pulse AI meeting",
            description: body.description ?? "",
            start: { dateTime: startsAt, timeZone: "Europe/Tirane" },
            end: { dateTime: endsAt, timeZone: "Europe/Tirane" },
            attendees: typeof body.attendee_email === "string" ? [{ email: body.attendee_email }] : [],
            reminders: {
              useDefault: false,
              overrides: [{ method: "email", minutes: 1440 }, { method: "popup", minutes: 60 }],
            },
          }),
        },
      );
      const event = await response.json() as { id?: string; htmlLink?: string };
      if (!response.ok) throw new Error(`Google Calendar create event returned ${response.status}`);
      await writeSyncLog(admin, workspaceId, "calendar_create_event", "success", {
        connection_id: connection.id,
        event_id: event.id ?? null,
      });
      return json(req, { success: true, event_id: event.id, link: event.htmlLink });
    }

    return json(req, { error: "Unknown action", allowed_actions: ["sync_drive", "sync_calendar", "create_event"] }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Workspace operation failed";
    console.error("google-workspace-sync operation error", message);
    await writeSyncLog(admin, workspaceId, action, "error", {
      connection_id: connection.id,
      error_code: "GOOGLE_WORKSPACE_OPERATION_FAILED",
    });
    return json(req, { error: "Google Workspace operation failed", code: "GOOGLE_WORKSPACE_OPERATION_FAILED" }, 502);
  }
});
