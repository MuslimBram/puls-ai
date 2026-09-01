import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createAdminClient } from "../_shared/admin-client.ts";
import { randomSessionToken, sha256Hex } from "../_shared/leah-session.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";

const admin = createAdminClient();
const SESSION_TTL_MS = 60 * 60 * 1000;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const handoffCode = body.handoff_code;
    if (typeof handoffCode !== "string" || handoffCode.length < 32 || handoffCode.length > 256) {
      return json(req, { error: "LEAH handoff invalid or expired" }, 401);
    }

    const codeHash = await sha256Hex(handoffCode);
    const rawSessionToken = randomSessionToken();
    const sessionTokenHash = await sha256Hex(rawSessionToken);
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    const { data, error } = await admin.rpc("leah_redeem_handoff", {
      _code_hash: codeHash,
      _session_token_hash: sessionTokenHash,
      _session_expires_at: sessionExpiresAt,
    });
    if (error) throw error;
    if (!data || typeof data !== "object") throw new Error("LEAH_HANDOFF_INVALID");

    const result = data as Record<string, unknown>;
    return json(req, {
      session_token: rawSessionToken,
      session_id: result.session_id,
      workspace_id: result.workspace_id,
      role: result.role,
      expires_at: result.expires_at,
      limits: result.limits,
    });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "";
    if (raw.includes("LEAH_HANDOFF_ACCESS_REVOKED")) {
      return json(req, { error: "LEAH workspace access revoked" }, 403);
    }
    if (raw.includes("LEAH_HANDOFF_ENTITLEMENT_INACTIVE")) {
      return json(req, { error: "LEAH entitlement inactive" }, 403);
    }
    if (raw.includes("LEAH_HANDOFF_INVALID")) {
      return json(req, { error: "LEAH handoff invalid or expired" }, 401);
    }
    return json(req, { error: "Internal LEAH handoff error" }, 500);
  }
});
