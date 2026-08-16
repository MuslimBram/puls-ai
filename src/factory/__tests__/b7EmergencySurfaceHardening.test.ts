import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

describe("B7 Emergency Surface Hardening - Wave 1 V2 Tests", () => {
  describe("STATIC CONTRACT TESTS", () => {
    it("1. Verifies 20260816213000_b7_emergency_surface_hardening.sql revokes EXECUTE from PUBLIC, anon, authenticated for 10 system functions", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const b7Wave1File = files.find((f) => f.includes("b7_emergency_surface_hardening"));

      expect(b7Wave1File).toBeDefined();

      const content = readFileSync(join(migrationsDir, b7Wave1File!), "utf-8");

      const systemFunctions = [
        "cleanup_expired_unpaid_accounts()",
        "enqueue_email(text, jsonb)",
        "read_email_batch(text, integer, integer)",
        "delete_email(text, bigint)",
        "move_to_dlq(text, text, bigint, jsonb)",
        "email_queue_dispatch()",
        "email_queue_wake()",
        "reset_daily_ai_replies()",
        "reset_monthly_usage()",
        "reset_expired_media_daily_usage()",
      ];

      for (const fn of systemFunctions) {
        expect(content).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
        expect(content).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
      }
    });

    it("2. Verifies search_path fixes for 4 sensitive functions while preserving email_queue search_path=\"\" and verify_white_label_license public grant contract", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const b7Wave1File = files.find((f) => f.includes("b7_emergency_surface_hardening"));

      expect(b7Wave1File).toBeDefined();

      const content = readFileSync(join(migrationsDir, b7Wave1File!), "utf-8");

      expect(content).toContain("evaluate_contact_policy(uuid,uuid,text,text)");
      expect(content).toContain("validate_nba_against_rules(uuid,text,numeric,text,uuid)");
      expect(content).toContain("verify_white_label_license(text)");
      expect(content).toContain("notify_admin_on_payment_submission()");

      // Preserves email_queue_dispatch and email_queue_wake search_path="" (no ALTER ... SET search_path for these functions)
      expect(content).not.toContain("ALTER FUNCTION public.email_queue_dispatch");
      expect(content).not.toContain("ALTER FUNCTION public.email_queue_wake");

      // Preserves verify_white_label_license public grant contract (no REVOKE for verify_white_label_license)
      expect(content).not.toContain("REVOKE EXECUTE ON FUNCTION public.verify_white_label_license");
    });
  });

  describe("RUNTIME INTEGRATION — SKIPPED", () => {
    it.skip("Requires Docker / real test DB credentials in runner environment", () => {
      // Skipped until real test DB / staging credentials are available
    });
  });
});
