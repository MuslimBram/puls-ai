/**
 * _shared/admin-client.ts
 *
 * Reads the Supabase secret key using the official Supabase new API key pattern:
 *   SUPABASE_SECRET_KEYS → JSON object keyed by name, e.g. {"default":"sb_secret_..."}
 *
 * Falls back to SUPABASE_SERVICE_ROLE_KEY (legacy JWT) while the migration is in
 * progress. Once legacy keys are disabled, remove the fallback.
 *
 * IMPORTANT: Send key on the `apikey` header ONLY — not on `Authorization: Bearer`.
 * New secret keys are not JWTs and will be rejected there.
 * The `@supabase/supabase-js` v2 client sends both headers by default; if you see
 * 401 errors after disabling legacy keys, migrate to @supabase/server SDK (Option 2).
 *
 * Reference: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
 */
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * Returns the service/secret key using the new SUPABASE_SECRET_KEYS env var
 * with a fallback to the legacy SUPABASE_SERVICE_ROLE_KEY.
 */
export function getServiceKey(): string {
  const newKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (newKeys) {
    try {
      const parsed = JSON.parse(newKeys);
      const key = parsed["default"];
      if (key) return key;
    } catch {
      // fall through to legacy
    }
  }
  // Legacy fallback — remove after Disable JWT-based API keys is confirmed
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

/**
 * Creates a Supabase admin client using the service/secret key.
 * Always uses persistSession: false (Edge Function best practice).
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    getServiceKey(),
    { auth: { persistSession: false } }
  );
}
