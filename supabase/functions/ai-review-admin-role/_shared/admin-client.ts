import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
export function getServiceKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) { try { const parsed = JSON.parse(raw); if (parsed.default) return parsed.default; } catch {} }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
export function createAdminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", getServiceKey(), { auth: { persistSession: false } });
}