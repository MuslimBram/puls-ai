import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { getServiceKey } from "../_shared/admin-client.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { connectTlsToPublicHostname, validatePublicHostnameSyntax } from "../_shared/public-network-guard.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...getCors(req), "Content-Type": "application/json" },
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function rawCredentialString(value: unknown, max: number): string {
  return typeof value === "string" && value.length <= max ? value : "";
}

async function readUntil(
  conn: Deno.TlsConn,
  marker: string,
  timeoutMs = 10_000,
): Promise<string> {
  const decoder = new TextDecoder();
  const buffer = new Uint8Array(8_192);
  let output = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = Math.max(250, deadline - Date.now());
    const result = await Promise.race([
      conn.read(buffer),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
    ]);
    if (result === null) break;
    if (result === 0) break;
    output += decoder.decode(buffer.subarray(0, result));
    if (output.includes(marker)) return output;
  }

  throw new Error("IMAP server response timed out");
}

function escapeImapQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceKey()!,
    { auth: { persistSession: false } },
  );

  const { data: { user }, error: userError } = await service.auth.getUser(authHeader.slice(7));
  if (userError || !user) return json(req, { error: "Unauthorized" }, 401);

  try {
    const body = asRecord(await req.json());
    const workspaceId = safeString(body.workspace_id, 64);
    const host = validatePublicHostnameSyntax(safeString(body.imap_host, 253));
    const username = safeString(body.imap_user, 320);
    // Credentials are opaque bytes from the user's perspective. Do not trim or
    // normalize whitespace because that can silently change a valid password.
    const password = rawCredentialString(body.imap_password, 1_024);
    const port = Number(body.imap_port ?? 993);

    if (!workspaceId || !host || !username || !password) {
      return json(req, { error: "workspace_id, imap_host, imap_user and imap_password are required" }, 400);
    }
    if (port !== 993) {
      return json(req, { error: "Only IMAPS on port 993 is supported" }, 400);
    }

    const [{ data: member }, { data: owned }] = await Promise.all([
      service.rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspaceId }),
      service.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle(),
    ]);
    if (!member && !owned) return json(req, { error: "Forbidden: not a workspace member" }, 403);

    let conn: Deno.TlsConn | null = null;
    try {
      // Resolve and pin a public IP before TLS/LOGIN. The TLS upgrade keeps the
      // original hostname for certificate verification without a second DNS lookup.
      conn = await connectTlsToPublicHostname(host, 993);
      const greeting = await readUntil(conn, "\r\n", 8_000);
      if (!/^\*\s+(OK|PREAUTH)\b/im.test(greeting)) {
        throw new Error("IMAP server did not return a valid greeting");
      }

      const tag = "A001";
      const command = `${tag} LOGIN "${escapeImapQuoted(username)}" "${escapeImapQuoted(password)}"\r\n`;
      await conn.write(new TextEncoder().encode(command));
      const loginResponse = await readUntil(conn, `${tag} `, 10_000);
      if (!new RegExp(`^${tag}\\s+OK\\b`, "im").test(loginResponse)) {
        return json(req, { ok: false, verified: false, error: "IMAP authentication failed" }, 400);
      }

      try {
        await conn.write(new TextEncoder().encode("A999 LOGOUT\r\n"));
      } catch {
        // Best effort only; connection is closed below.
      }
    } finally {
      try { conn?.close(); } catch { /* noop */ }
    }

    return json(req, {
      ok: true,
      verified: true,
      host,
      port: 993,
      detail: `Verified secure IMAP connection for ${username}`,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "IMAP verification failed";
    console.error("[VERIFY-EMAIL-CONNECTION] verification failed", { user_id: user.id, detail });
    return json(req, { ok: false, verified: false, error: detail }, 400);
  }
});
