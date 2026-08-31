import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { askAI } from "../_shared/ai-client.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { resolvePublicAddresses, validatePublicHostnameSyntax } from "../_shared/public-network-guard.ts";

const getCors = (req: Request) => buildCorsHeaders(req);
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

type VicidialConnection = {
  id: string;
  credentials_encrypted: Record<string, unknown> | null;
  config_json: Record<string, unknown> | null;
};

type VicidialCredentials = {
  apiUrl: string;
  username: string;
  password: string;
  source: string;
  recordingBaseUrl: string | null;
};

function asString(value: unknown, max = 2048): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function resolveVicidialConnection(
  admin: ReturnType<typeof createClient>,
  userId: string,
  workspaceId: string,
): Promise<VicidialConnection> {
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
    .eq("provider", "vicidial")
    .eq("status", "connected")
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) throw new Error("VICIDIAL_NOT_CONNECTED");
  return connection as VicidialConnection;
}

async function resolveVicidialCredentials(connection: VicidialConnection): Promise<VicidialCredentials> {
  const encrypted = connection.credentials_encrypted ?? {};
  const config = connection.config_json ?? {};

  const usernameRaw = encrypted.username;
  const passwordRaw = encrypted.password;
  if (typeof usernameRaw !== "string" || typeof passwordRaw !== "string") {
    throw new Error("VICIDIAL_CREDENTIALS_MISSING");
  }

  const apiUrlRaw = asString(config.api_url, 2048);
  if (!apiUrlRaw) throw new Error("VICIDIAL_API_URL_MISSING");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiUrlRaw);
  } catch {
    throw new Error("VICIDIAL_API_URL_INVALID");
  }
  if (parsedUrl.protocol !== "https:") throw new Error("VICIDIAL_API_URL_HTTPS_REQUIRED");
  validatePublicHostnameSyntax(parsedUrl.hostname);
  await resolvePublicAddresses(parsedUrl.hostname);

  const recordingBaseRaw = asString(config.recording_base_url, 2048);
  let recordingBaseUrl: string | null = null;
  if (recordingBaseRaw) {
    try {
      const recordingUrl = new URL(recordingBaseRaw);
      if (recordingUrl.protocol !== "https:") throw new Error("invalid protocol");
      validatePublicHostnameSyntax(recordingUrl.hostname);
      await resolvePublicAddresses(recordingUrl.hostname);
      recordingBaseUrl = recordingUrl.toString().replace(/\/$/, "");
    } catch {
      throw new Error("VICIDIAL_RECORDING_URL_INVALID");
    }
  }

  return {
    apiUrl: parsedUrl.toString(),
    username: await decryptIfNeeded(usernameRaw),
    password: await decryptIfNeeded(passwordRaw),
    source: asString(config.source, 120) || "pulse_ai",
    recordingBaseUrl,
  };
}

async function fetchVicidialCDR(
  credentials: VicidialCredentials,
  dateStart: string,
  dateEnd: string,
): Promise<Array<Record<string, string>>> {
  const requestUrl = new URL(credentials.apiUrl);
  requestUrl.search = new URLSearchParams({
    source: credentials.source,
    user: credentials.username,
    pass: credentials.password,
    function: "call_log",
    query_date: dateStart,
    end_date: dateEnd,
    stage: "ALL",
    format: "json",
  }).toString();

  const response = await fetch(requestUrl, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`VICIdial API returned ${response.status}`);

  const text = await response.text();
  try {
    const data = JSON.parse(text) as unknown;
    if (Array.isArray(data)) return data as Array<Record<string, string>>;
    if (data && typeof data === "object" && Array.isArray((data as { result?: unknown }).result)) {
      return (data as { result: Array<Record<string, string>> }).result;
    }
    return [];
  } catch {
    const lines = text.split("\n").filter((line) => line.trim() && !line.startsWith("SUCCESS"));
    return lines.map((line) => {
      const parts = line.split("|");
      return {
        uniqueid: parts[0] ?? "",
        phone_number: parts[1] ?? "",
        agent_user: parts[2] ?? "",
        disposition: parts[3] ?? "",
        length_in_sec: parts[4] ?? "0",
        call_date: parts[5] ?? "",
        direction: parts[6] ?? "outbound",
        recording_filename: parts[7] ?? "",
      };
    });
  }
}

async function analyzeCall(
  transcript: string,
  options: { workspaceId: string; authHeader: string; userId: string },
): Promise<{ summary: string; sentiment: string; lead_detected: boolean; key_topics: string[] }> {
  try {
    const result = await askAI(
      "Ti je analizues i bisedave të shitjeve. Kthe VETËM JSON.",
      `Analize këtë bisedë telefonike dhe kthe:\n${transcript.substring(0, 1500)}\n\nJSON: {"summary":"1 fjali","sentiment":"positive|neutral|negative","lead_detected":true/false,"key_topics":["topic1"]}`,
      200,
      {
        workspaceId: options.workspaceId,
        authHeader: options.authHeader,
        taskType: "complex_reasoning",
        userId: options.userId,
      },
    );
    return JSON.parse(result.replace(/```json|```/g, "").trim());
  } catch {
    return { summary: "", sentiment: "neutral", lead_detected: false, key_topics: [] };
  }
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

  let body: { date_start?: string; date_stop?: string; workspace_id?: string; analyze_with_ai?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "JSON body required" }, 400);
  }

  const workspaceId = asString(body.workspace_id, 64);
  if (!workspaceId) return json(req, { error: "workspace_id is required" }, 400);

  let connection: VicidialConnection;
  let credentials: VicidialCredentials;
  try {
    connection = await resolveVicidialConnection(admin, authData.user.id, workspaceId);
    credentials = await resolveVicidialCredentials(connection);
  } catch (error) {
    const message = error instanceof Error ? error.message : "VICIdial setup error";
    if (message === "FORBIDDEN_WORKSPACE") return json(req, { error: "Forbidden" }, 403);
    if (message === "VICIDIAL_NOT_CONNECTED" || message.includes("VICIDIAL_")) {
      return json(req, { error: "VICIdial is not safely connected for this workspace", code: message }, 400);
    }
    console.error("vicidial-cdr-sync setup error", message);
    return json(req, { error: "VICIdial setup failed" }, 500);
  }

  const dateStop = body.date_stop ?? new Date().toISOString().split("T")[0];
  const dateStart = body.date_start ?? (() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split("T")[0];
  })();

  try {
    const calls = await fetchVicidialCDR(credentials, dateStart, dateStop);
    let synced = 0;
    let skipped = 0;
    let aiAnalyzed = 0;

    for (const call of calls) {
      const externalCallId = asString(call.uniqueid, 255);
      if (!externalCallId) continue;

      const { data: existing, error: existingError } = await admin
        .from("call_records")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("channel_provider", "vicidial")
        .eq("external_call_id", externalCallId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        skipped++;
        continue;
      }

      let aiData = { summary: "", sentiment: "neutral", lead_detected: false, key_topics: [] as string[] };
      if (body.analyze_with_ai && call.recording_filename) {
        aiData = await analyzeCall(
          `Agjent: ${call.agent_user}, Dispozicion: ${call.disposition}, Kohëzgjatja: ${call.length_in_sec}s`,
          { workspaceId, authHeader, userId: authData.user.id },
        );
        aiAnalyzed++;
      }

      const duration = Math.max(0, Number.parseInt(call.length_in_sec ?? "0", 10) || 0);
      const recordingFilename = asString(call.recording_filename, 1024).replace(/^\/+/, "");
      const recordingUrl = credentials.recordingBaseUrl && recordingFilename
        ? `${credentials.recordingBaseUrl}/${encodeURI(recordingFilename)}`
        : null;

      const { error: insertError } = await admin.from("call_records").insert({
        workspace_id: workspaceId,
        user_id: authData.user.id,
        contact_phone: asString(call.phone_number, 120) || null,
        channel_provider: "vicidial",
        call_direction: call.direction === "inbound" ? "inbound" : "outbound",
        call_status: "completed",
        call_duration: duration,
        call_outcome: asString(call.disposition, 120) || null,
        ai_call_summary: aiData.summary || null,
        recording_url: recordingUrl,
        external_call_id: externalCallId,
        notes: JSON.stringify({
          agent_user: asString(call.agent_user, 120) || null,
          source_call_date: asString(call.call_date, 120) || null,
          ai_sentiment: aiData.sentiment,
          lead_detected: aiData.lead_detected,
          integration_connection_id: connection.id,
        }),
      });

      if (insertError) {
        if (insertError.code === "23505") {
          skipped++;
          continue;
        }
        throw insertError;
      }
      synced++;
    }

    return json(req, {
      success: true,
      workspace_id: workspaceId,
      period: { from: dateStart, to: dateStop },
      total_calls: calls.length,
      synced,
      skipped,
      ai_analyzed: aiAnalyzed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VICIdial sync failed";
    console.error("vicidial-cdr-sync operation error", {
      workspace_id: workspaceId,
      connection_id: connection.id,
      detail: message,
    });
    return json(req, { error: "VICIdial sync failed", code: "VICIDIAL_SYNC_FAILED" }, 502);
  }
});
