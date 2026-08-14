// supabase/functions/_shared/token-utils.ts
// AES-GCM 256-bit encryption for sensitive credentials
// TOKEN_ENCRYPTION_KEY = base64(32 random bytes)
// Generate: openssl rand -base64 32

function base64ToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const standard = padded + "=".repeat(padLen);
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getEncKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  const keyBytes = base64ToBytes(raw);
  if (keyBytes.length !== 32) throw new Error(`TOKEN_ENCRYPTION_KEY must be 32 bytes (got ${keyBytes.length})`);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const key = await getEncKey();
  const combined = base64ToBytes(ciphertext);
  if (combined.length < 13) throw new Error("Invalid ciphertext: too short");
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(dec);
}

const ENC_PREFIX = "enc:";

/**
 * Encrypt a value and add "enc:" prefix for storage.
 * Use this when saving credentials to the database.
 */
export async function encryptForStorage(value: string): Promise<string> {
  const encrypted = await encryptToken(value);
  return ENC_PREFIX + encrypted;
}

/**
 * Decrypt a value if it has the "enc:" prefix, otherwise return as-is.
 * Safe to call on both encrypted and plaintext values.
 */
export async function decryptIfNeeded(value: string): Promise<string> {
  if (!value) return value;
  if (value.startsWith(ENC_PREFIX)) {
    return decryptToken(value.slice(ENC_PREFIX.length));
  }
  return value; // plaintext — used before encryption migration
}
