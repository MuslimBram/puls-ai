import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const batch = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260823010000_supabase_security_batch_1.sql"),
  "utf8",
);
const b7 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821121000_b7_cron_surface_hardening.sql"),
  "utf8",
);

describe("Supabase Security Batch 1", () => {
  it("pins the two residual payment search paths only when exact functions exist", () => {
    expect(batch).toContain("to_regprocedure('public.generate_payment_reference()')");
    expect(batch).toContain(
      "ALTER FUNCTION public.generate_payment_reference() SET search_path = public, pg_temp",
    );
    expect(batch).toContain("to_regprocedure('public.set_payment_reference()')");
    expect(batch).toContain(
      "ALTER FUNCTION public.set_payment_reference() SET search_path = public, pg_temp",
    );
  });

  it("relies on canonical B7 for the other four live mutable-search-path warnings", () => {
    for (const fn of [
      "notify_admin_on_payment_submission",
      "verify_white_label_license",
      "validate_nba_against_rules",
      "evaluate_contact_policy",
    ]) {
      expect(b7).toContain(fn);
      expect(batch).not.toContain(`ALTER FUNCTION public.${fn}`);
    }
  });

  it("removes broad generated-media listing policies and restores authenticated user-folder listing", () => {
    expect(batch).toContain(
      "DROP POLICY IF EXISTS generated_media_public_read ON storage.objects;",
    );
    expect(batch).toContain(
      'DROP POLICY IF EXISTS "Generated media is publicly accessible" ON storage.objects;',
    );
    expect(batch).toContain("FOR SELECT");
    expect(batch).toContain("TO authenticated");
    expect(batch).toContain("bucket_id = 'generated-media'");
    expect(batch).toContain("(auth.uid())::text = (storage.foldername(name))[1]");
  });

  it("does not change the generated-media bucket public delivery flag", () => {
    expect(batch).not.toMatch(/UPDATE\s+storage\.buckets/i);
    expect(batch).not.toMatch(/public\s*=\s*false/i);
  });

  it("does not perform SECURITY DEFINER grant revocation in this batch", () => {
    expect(batch).not.toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION/i);
    expect(batch).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION/i);
  });
});
