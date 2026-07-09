// supabase/functions/_shared/token-utils.ts
// ============================================================
// Shifrimi/deshifrimi i tokenëve me AES-GCM 256-bit
// Importohet nga të gjitha Edge Functions që trajtojnë tokens:
//   - connect-instagram-oauth
//   - scan-instagram-channel
//   - unified-ai-agent
//
// Vendosja:
//   supabase/functions/_shared/token-utils.ts
//
// Sekret i nevojshëm:
//   TOKEN_ENCRYPTION_KEY = base64(32 bytes të rastit)
//   Gjenerohet 1 herë: openssl rand -base64 32
//   Vendoset: supabase secrets set TOKEN_ENCRYPTION_KEY=<vlera>
// ============================================================

// ── Utilitete konvertimi ────────────────────────────────────

/** Konverton string base64 në Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  // Shto padding nëse mungon
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const standard = padded + "=".repeat(padLen);

  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Konverton Uint8Array në string base64 (URL-safe) */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, ""); // URL-safe, pa padding
}

/** Konverton string UTF-8 në Uint8Array */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Konverton Uint8Array në string UTF-8 */
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ── Importimi i çelësit ─────────────────────────────────────

/** Ngarkon çelësin AES-GCM nga variabla e ambientit */
async function importEncryptionKey(): Promise<CryptoKey> {
  const keyBase64 = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!keyBase64) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY mungon. Vendos: supabase secrets set TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)"
    );
  }

  const keyBytes = base64ToBytes(keyBase64);
  if (keyBytes.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY duhet të jetë 32 bytes (256 bit). Gjetur: ${keyBytes.length} bytes.`
    );
  }

  return crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false,        // jo e eksportueshme
    ["encrypt", "decrypt"]
  );
}

// ── Funksionet kryesore ─────────────────────────────────────

/**
 * Shifron një token dhe e kthen si string i ruajtshëm në DB.
 *
 * Formati i outputit: base64(iv) + "." + base64(ciphertext)
 * IV (12 bytes) është i rastit për çdo operacion shifrimi.
 * Kjo do të thotë se i njëjti token jep rezultate të ndryshme
 * çdo herë — kjo është e saktë kriptografikisht.
 *
 * @param token  Tokeni plain-text (p.sh. Instagram access token)
 * @returns      String i sigurt për ruajtje në kolonë text
 */
export async function encryptToken(token: string): Promise<string> {
  const key = await importEncryptionKey();

  // IV 12 bytes (96 bit) — rekomandimi standard për AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    stringToBytes(token) as unknown as BufferSource
  );

  const ivB64 = bytesToBase64(iv);
  const ctB64 = bytesToBase64(new Uint8Array(ciphertext));

  return `${ivB64}.${ctB64}`;
}

/**
 * Deshifron një token të ruajtur në DB.
 *
 * @param encrypted  String i formës "ivB64.ciphertextB64"
 * @returns          Tokeni plain-text origjinal
 * @throws           Nëse formati është i gabuar ose çelësi nuk përputhet
 */
export async function decryptToken(encrypted: string): Promise<string> {
  // Validim bazik i formatit
  const parts = encrypted.split(".");
  if (parts.length !== 2) {
    throw new Error(
      `Format i pavlefshëm i token të shifruar. Pritet 'ivB64.ciphertextB64', gjetur: ${parts.length} pjesë.`
    );
  }

  const [ivB64, ctB64] = parts;
  const key = await importEncryptionKey();

  let iv: Uint8Array;
  let ciphertext: Uint8Array;

  try {
    iv = base64ToBytes(ivB64);
    ciphertext = base64ToBytes(ctB64);
  } catch {
    throw new Error("Token i shifruar përmban base64 të pavlefshëm.");
  }

  if (iv.length !== 12) {
    throw new Error(`IV duhet të jetë 12 bytes, gjetur: ${iv.length}`);
  }

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      ciphertext.buffer as ArrayBuffer
    );
  } catch {
    // AES-GCM dështon nëse: çelësi i gabuar, të dhëna të dëmtuara,
    // ose tag-u i autentifikimit nuk përputhet (tamper detection)
    throw new Error(
      "Deshifrimi dështoi. Çelësi mund të jetë i gabuar ose tokeni i dëmtuar."
    );
  }

  return bytesToString(new Uint8Array(plaintext));
}

/**
 * Teston nëse një string është token i shifruar (format i vlefshëm)
 * Pa e deshifruar — vetëm kontrollon formatin.
 */
export function isEncryptedToken(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  try {
    const iv = base64ToBytes(parts[0]);
    return iv.length === 12;
  } catch {
    return false;
  }
}

/**
 * Ruan token ekzistues plain-text si i shifruar (migracion nga Lovable).
 * Kontrollon fillimisht nëse është tashmë i shifruar.
 */
export async function ensureEncrypted(value: string): Promise<string> {
  if (isEncryptedToken(value)) {
    return value; // tashmë i shifruar
  }
  return encryptToken(value); // plain-text → shifroje
}
