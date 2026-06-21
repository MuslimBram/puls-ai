// Shared webhook signature validators for public Lovable edge functions.
//
// Each validator returns true on success, false on rejection. Callers MUST
// fail closed (return 401/403) when a required secret is configured but the
// signature does not match. To allow safe local rollout, validators return
// `true` ONLY when the corresponding secret is NOT set in the environment;
// in production, set all secrets to enable enforcement.

const enc = new TextEncoder();

async function importHmacKey(secret: string, algo: "SHA-1" | "SHA-256"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: algo },
    false,
    ["sign", "verify"],
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
// Header: x-hub-signature-256: sha256=<hex>
// Computed over the raw request body using the Meta App Secret.
export async function verifyMetaSignature(
  rawBody: string,
  headerValue: string | null,
  secretEnv = "WHATSAPP_APP_SECRET",
): Promise<{ ok: boolean; reason?: string }> {
  const secret = Deno.env.get(secretEnv);
  if (!secret) return { ok: true, reason: "secret_not_configured" };
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
// Header: X-Telegram-Bot-Api-Secret-Token (constant-time string compare).
export function verifyTelegramSecret(
  headerValue: string | null,
  secretEnv = "TELEGRAM_WEBHOOK_SECRET",
): { ok: boolean; reason?: string } {
  const secret = Deno.env.get(secretEnv);
  if (!secret) return { ok: true, reason: "secret_not_configured" };
  if (!headerValue) return { ok: false, reason: "missing_secret_header" };
  return timingSafeEqual(headerValue, secret)
    ? { ok: true }
    : { ok: false, reason: "secret_mismatch" };
}

// ── Twilio ──────────────────────────────────────────────────────────────────
// Header: X-Twilio-Signature
// Signature = base64( HMAC-SHA1( authToken, fullUrl + sortedFormKeyValuesConcat ) )
// For JSON or empty bodies, use fullUrl alone.
export async function verifyTwilioSignature(
  req: Request,
  rawBody: string,
  contentType: string,
  secretEnv = "TWILIO_AUTH_TOKEN",
): Promise<{ ok: boolean; reason?: string }> {
  const secret = Deno.env.get(secretEnv);
  if (!secret) return { ok: true, reason: "secret_not_configured" };

  const header = req.headers.get("x-twilio-signature");
  if (!header) return { ok: false, reason: "missing_signature_header" };

  // Reconstruct the public URL Twilio used to sign. Prefer x-forwarded-* headers.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const reqUrl = new URL(req.url);
  const fullUrl = host ? `${proto}://${host}${reqUrl.pathname}${reqUrl.search}` : req.url;

  let dataString = fullUrl;
  if (contentType.includes("application/x-www-form-urlencoded") && rawBody) {
    const params = new URLSearchParams(rawBody);
    const sorted: string[] = [];
    const keys: string[] = [];
    params.forEach((_, k) => { if (!keys.includes(k)) keys.push(k); });
    keys.sort();
    for (const k of keys) {
      // Twilio concatenates all values for a key in original order
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
