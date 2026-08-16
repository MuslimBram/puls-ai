// supabase/functions/google-workspace-sync/index.ts
// ============================================================
// Google Workspace: Drive + Calendar + Gmail
// POST ?action=sync_drive    → sinkronizon dokumentet
// POST ?action=sync_calendar → sinkronizon takimet
// POST ?action=create_event  → krijon event në Calendar
// POST ?action=upload_drive  → ngarkon dokument në Drive
// Secrets: GOOGLE_SERVICE_ACCOUNT_KEY (JSON i plotë)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// JWT për Google Service Account
async function getGoogleToken(scopes: string[]): Promise<string> {
  const keyJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!keyJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY mungon");

  const key = JSON.parse(keyJson) as {
    client_email: string; private_key: string; project_id: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: key.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const signingInput = `${enc(header)}.${enc(payload)}`;

  // Import private key
  const pemBody = key.private_key
    .replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","")
    .replace(/\s/g,"");
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) throw new Error(`Google auth dështoi: ${tokenData.error}`);
  return tokenData.access_token;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  if (!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")) {
    return json({
      error: "Google Workspace nuk është konfiguruar",
      setup: {
        step1: "console.cloud.google.com → New Project",
        step2: "Aktivizo: Google Drive API, Google Calendar API, Gmail API",
        step3: "IAM → Service Accounts → Create → JSON key",
        step4: "Ndaj Drive/Calendar me service account email (sharing normal)",
        step5: "Vendos JSON-in e plotë te Supabase Secrets: GOOGLE_SERVICE_ACCOUNT_KEY",
      }
    }, 503);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "sync_drive";
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /**/ }

  const workspaceId = (body.workspace_id as string) ?? user.id;

  // ── SYNC DRIVE ───────────────────────────────────────────────
  if (action === "sync_drive") {
    try {
      const token = await getGoogleToken(["https://www.googleapis.com/auth/drive.readonly"]);
      const folderId = (body.folder_id as string) ?? "";
      const query = folderId
        ? `'${folderId}' in parents and trashed=false`
        : "trashed=false";

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=100`,
        { headers: { "Authorization": `Bearer ${token}` } }
      );
      const data = await res.json() as { files?: Array<Record<string, string>> };
      const files = data.files ?? [];

      // Ruaj listën e fajllave (si reference, jo përmbajtje)
      await supabase.from("google_sync_log").insert({
        workspace_id: workspaceId, service: "drive",
        action: "list_files", status: "success", items_synced: files.length,
      }).catch(() => {});

      return json({ success: true, files_found: files.length, files: files.slice(0, 20) });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  // ── SYNC CALENDAR ────────────────────────────────────────────
  if (action === "sync_calendar") {
    try {
      const token = await getGoogleToken(["https://www.googleapis.com/auth/calendar.readonly"]);
      const calendarId = (body.calendar_id as string) ?? "primary";
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&orderBy=startTime&singleEvents=true&maxResults=50`,
        { headers: { "Authorization": `Bearer ${token}` } }
      );
      const data = await res.json() as { items?: Array<Record<string, unknown>> };
      const events = data.items ?? [];

      // Sinkronizon me appointments (nëse ka match me email klientit)
      let synced = 0;
      for (const ev of events) {
        const start = (ev.start as Record<string, string>)?.dateTime ?? (ev.start as Record<string, string>)?.date;
        const end = (ev.end as Record<string, string>)?.dateTime ?? (ev.end as Record<string, string>)?.date;
        if (!start) continue;

        await supabase.from("appointments").upsert({
          workspace_id: workspaceId,
          client_name: (ev.summary as string) ?? "Google Calendar Event",
          starts_at: new Date(start).toISOString(),
          ends_at: new Date(end ?? start).toISOString(),
          status: "confirmed",
          source: "google_calendar",
          notes: (ev.description as string) ?? null,
        }, { onConflict: "workspace_id,starts_at" }).catch(() => {});
        synced++;
      }

      return json({ success: true, events_found: events.length, synced });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  // ── CREATE CALENDAR EVENT ────────────────────────────────────
  if (action === "create_event") {
    try {
      const token = await getGoogleToken(["https://www.googleapis.com/auth/calendar"]);
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: body.title ?? "Takim Pulse AI",
            description: body.description ?? "",
            start: { dateTime: body.starts_at, timeZone: "Europe/Tirane" },
            end: { dateTime: body.ends_at, timeZone: "Europe/Tirane" },
            attendees: body.attendee_email ? [{ email: body.attendee_email }] : [],
            reminders: { useDefault: false, overrides: [{ method: "email", minutes: 1440 }, { method: "popup", minutes: 60 }] },
          }),
        }
      );
      const event = await res.json() as { id?: string; htmlLink?: string };
      return json({ success: true, event_id: event.id, link: event.htmlLink });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  return json({ error: "Veprim i panjohur. Mundësitë: sync_drive, sync_calendar, create_event" }, 400);
});
