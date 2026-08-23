// Shared webhook signature validators — FAIL-CLOSED in production.
//
// SECURITY CONTRACT:
//   - If the relevant secret IS configured: invalid/missing signature → { ok: false }
//   - If the relevant secret is NOT configured: FAIL-CLOSED → { ok: false, reason: "not_configured" }
//     (no silent pass-through in production)
//
// Callers must return 403 when ok === false.

const enc = new TextEncoder();

async function importHmacKey(secret: string, algo: "SHA-1" | "SHA-256"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: algo }, false, ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

function toBase64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Meta / WhatsApp Cloud API ───────────────────────────────────────────────
export async function verifyMetaSignature(
  rawBody: string,
  headerValue: string | null,
  secretEnv = "WHATSAPP_APP_SECRET",
): Promise<{ ok: boolean; reason?: string }> {
  const secret = Deno.env.get(secretEnv);
  // FAIL-CLOSED: missing secret is a configuration error, not a pass
  if (!secret) return { ok: false, reason: "secret_not_configured" };
  if (!headerValue) return { ok: false, reason: "missing_signature_header" };

  const expected = headerValue.startsWith("sha256=") ? headerValue.slice(7) : headerValue;
  const key = await importHmacKey(secret, "SHA-256");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const actual = toHex(sig);
  return timingSafeEqual(expected.toLowerCase(), actual)
    ? { ok: true }
    : { ok: false, reason: "signature_mismatch" };
}

// ── Telegram Bot API ────────────────────────────────────────────────────────
export function verifyTelegramSecret(
  headerValue: string | null,
  secretEnv = "TELEGRAM_WEBHOOK_SECRET",
): { ok: boolean; reason?: string } {
  const secret = Deno.env.get(secretEnv);
  if (!secret) return { ok: false, reason: "secret_not_configured" };
  if (!headerValue) return { ok: false, reason: "missing_secret_header" };
  return timingSafeEqual(headerValue, secret)
    ? { ok: true }
    : { ok: false, reason: "secret_mismatch" };
}

// ── Twilio ──────────────────────────────────────────────────────────────────
// Header:    X-Twilio-Signature
// Algorithm: base64( HMAC-SHA1( authToken, fullUrl + sortedFormParams ) )
// For JSON / empty body: fullUrl alone.
//
// If a caller supplies the fourth argument, it is explicitly asking for
// workspace-scoped verification. In that mode we MUST NOT fall back to the
// environment-level token when workspace resolution failed. Callers that truly
// need legacy/global verification must omit the fourth argument entirely.
export async function verifyTwilioSignature(
  req: Request,
  rawBody: string,
  contentType: string,
  decryptedAuthToken?: string,
  secretEnv = "TWILIO_AUTH_TOKEN",
): Promise<{ ok: boolean; reason?: string }> {
  const workspaceScopedVerification = arguments.length >= 4;
  const secret = workspaceScopedVerification
    ? decryptedAuthToken
    : Deno.env.get(secretEnv);

  if (!secret) {
    console.error(
      workspaceScopedVerification
        ? "[twilio-sig] workspace auth token unavailable — rejecting request"
        : "[twilio-sig] TWILIO_AUTH_TOKEN not configured — rejecting request",
    );
    return {
      ok: false,
      reason: workspaceScopedVerification
        ? "workspace_auth_token_unavailable"
        : "auth_token_not_configured",
    };
  }

  const header = req.headers.get("x-twilio-signature");
  if (!header) return { ok: false, reason: "missing_signature_header" };

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const reqUrl = new URL(req.url);
  const fullUrl = host ? `${proto}://${host}${reqUrl.pathname}${reqUrl.search}` : req.url;

  let dataString = fullUrl;
  if (contentType.includes("application/x-www-form-urlencoded") && rawBody) {
    const params = new URLSearchParams(rawBody);
    const keys: string[] = [];
    params.forEach((_, k) => { if (!keys.includes(k)) keys.push(k); });
    keys.sort();
    const sorted: string[] = [];
    for (const k of keys) {
      for (const v of params.getAll(k)) sorted.push(k + v);
    }
    dataString = fullUrl + sorted.join("");
  }

  const key = await importHmacKey(secret, "SHA-1");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataString));
  const expected = toBase64(sig);
  return timingSafeEqual(expected, header)
    ? { ok: true }
    : { ok: false, reason: "signature_mismatch" };
}
