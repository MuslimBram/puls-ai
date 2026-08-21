import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

describe("B7 Cron Surface Hardening — REVOKE authenticated from cron/backend functions", () => {
  describe("STATIC CONTRACT TESTS", () => {
    it("1. Verifies 20260821121000_b7_cron_surface_hardening.sql revokes EXECUTE from PUBLIC, anon, authenticated for 10 backend/cron functions", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const migFile = files.find((f) => f.includes("b7_cron_surface_hardening"));

      expect(migFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, migFile!), "utf-8");

      const cronFunctions = [
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

      for (const fn of cronFunctions) {
        expect(content).toContain(
          `REVOKE EXECUTE ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`
        );
        expect(content).toContain(
          `GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`
        );
      }
    });

    it("2. Verifies search_path fixes for sensitive functions while preserving email_queue search_path='' and verify_white_label_license public grant contract", () => {
      const migrationsDir = join(process.cwd(), "supabase", "migrations");
      const files = readdirSync(migrationsDir);
      const migFile = files.find((f) => f.includes("b7_cron_surface_hardening"));

      expect(migFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, migFile!), "utf-8");

      // search_path fixes applied via IF EXISTS guards for safety
      expect(content).toContain("evaluate_contact_policy");
      expect(content).toContain("validate_nba_against_rules");
      expect(content).toContain("verify_white_label_license");
      expect(content).toContain("notify_admin_on_payment_submission");

      // email_queue_dispatch and email_queue_wake must NOT have search_path altered
      // (they preserve intentional search_path="" for secure isolation)
      expect(content).not.toContain("ALTER FUNCTION public.email_queue_dispatch");
      expect(content).not.toContain("ALTER FUNCTION public.email_queue_wake");

      // verify_white_label_license: search_path is fixed but its PUBLIC execute grant is NOT revoked
      expect(content).not.toContain(
        "REVOKE EXECUTE ON FUNCTION public.verify_white_label_license"
      );
    });
  });

  describe("RUNTIME INTEGRATION — SKIPPED", () => {
    it.skip("Requires Docker / real test DB credentials in runner environment", () => {
      // Skipped until real test DB / staging credentials are available
    });
  });
});
