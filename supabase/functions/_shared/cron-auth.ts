// Shared authentication helpers for internal/cron edge functions.
//
// Cron endpoints must not be publicly callable. They accept either:
//   - Authorization: Bearer <CRON_SECRET>
//   - X-Cron-Secret: <CRON_SECRET>
//
// If CRON_SECRET is not configured, requests are rejected with 503 to fail closed.

export type AuthFail = { status: number; body: string } | null;

export function requireCronAuth(req: Request): AuthFail {
  const configured = Deno.env.get("CRON_SECRET");
  if (!configured) {
    return { status: 503, body: JSON.stringify({ error: "CRON_SECRET not configured" }) };
  }
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const header = req.headers.get("x-cron-secret") || "";
  const supplied = bearer || header;
  if (!supplied || supplied !== configured) {
    return { status: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }
  return null;
}

// Shared secret for internal service-to-service webhook ingest endpoints.
// Accepts header X-Internal-Secret: <INTERNAL_WEBHOOK_SECRET>
export function requireInternalSecret(req: Request): AuthFail {
  const configured = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  if (!configured) {
    return { status: 503, body: JSON.stringify({ error: "INTERNAL_WEBHOOK_SECRET not configured" }) };
  }
  const supplied = req.headers.get("x-internal-secret") || "";
  if (!supplied || supplied !== configured) {
    return { status: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }
  return null;
}
