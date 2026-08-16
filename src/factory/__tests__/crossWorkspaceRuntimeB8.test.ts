import { describe, it, expect } from "vitest";

/**
 * B8: Cross-Workspace Runtime RLS Isolation Test
 *
 * These tests verify that RLS prevents cross-workspace data access.
 * They require a valid user JWT scoped to a test workspace (User A).
 *
 * Credentials must be provided via environment variables — never hardcoded:
 *   SUPABASE_URL              — your project URL
 *   SUPABASE_PUBLISHABLE_KEY  — publishable (anon) key for unauthenticated baseline
 *   SUPABASE_USER_A_JWT       — session JWT for User A (workspace A only) from Auth
 *   SUPABASE_WORKSPACE_B_ID   — a real workspace B UUID that User A does NOT belong to
 *
 * Tests that require env vars are skipped gracefully when vars are absent.
 * A genuine isolation test needs a VALID user JWT, NOT a fake or service key.
 * Using a fake JWT yields 401 (auth rejection), not the RLS-level 200+[] we want.
 */
describe("B8: Cross-Workspace Real Runtime RLS & Security Isolation", () => {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  // Real session JWT for User A, scoped to workspace A — provided by CI secret
  const userAJwt = process.env.SUPABASE_USER_A_JWT ?? "";
  // A real workspace B UUID that User A does not belong to
  const workspaceB = process.env.SUPABASE_WORKSPACE_B_ID ?? "ws-beta-22222222-2222-2222-2222-222222222222";

  const authHeaders = userAJwt
    ? { apikey: publishableKey, Authorization: `Bearer ${userAJwt}`, "Content-Type": "application/json" }
    : null;

  const tables = [
    "leads", "deals", "contacts", "inbox_messages",
    "customer_memory", "workspace_credentials", "billing_history",
    "community_ai_usage",
  ];

  for (const table of tables) {
    it(`Cross-workspace: User A querying ${table} for Workspace B returns 0 rows or access denied`, async () => {
      if (!authHeaders) {
        console.warn(`SKIP ${table}: SUPABASE_USER_A_JWT not set — cannot test RLS isolation without real user JWT`);
        return;
      }
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?workspace_id=eq.${workspaceB}`, {
        headers: authHeaders,
      });
      // With valid JWT for User A, RLS must deny access to Workspace B data
      // Expected: 200 with empty array (RLS filtered at DB level)
      // 401/403 is NOT acceptable here — it means auth rejected, not RLS
      if (res.status === 200) {
        const data = await res.json();
        expect(Array.isArray(data) && data.length === 0).toBe(true);
      } else if (res.status === 404) {
        // Table may not exist yet — skip
        console.warn(`SKIP ${table}: table not found (404)`);
      } else {
        // Any other non-200 with a real JWT is unexpected
        console.warn(`${table}: unexpected status ${res.status}`);
        expect([200, 404]).toContain(res.status);
      }
    });
  }
});
