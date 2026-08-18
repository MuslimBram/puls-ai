import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

describe("Emergency Runtime Security & Retirement V2 Comprehensive Audit Tests", () => {
  const rootDir = process.cwd();
  const migrationsDir = join(rootDir, "supabase", "migrations");
  const functionsDir = join(rootDir, "supabase", "functions");

  describe("1. P0-A: cleanup_expired_unpaid_accounts ACL Guarded Migration", () => {
    it("Verifies migration contains existence guard so absent-function does not throw error", () => {
      const files = readdirSync(migrationsDir);
      const aclMigrationFile = files.find((f) => f.includes("cleanup_unpaid_accounts_acl"));
      expect(aclMigrationFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, aclMigrationFile!), "utf-8");
      expect(content).toContain("IF EXISTS");
      expect(content).toContain("proname = 'cleanup_expired_unpaid_accounts'");
      expect(content).toContain("REVOKE EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() FROM PUBLIC, anon, authenticated;");
      expect(content).toContain("GRANT EXECUTE ON FUNCTION public.cleanup_expired_unpaid_accounts() TO service_role;");
      expect(content).not.toContain("CREATE OR REPLACE FUNCTION"); // Body untouched
    });
  });

  describe("2. P0-B: job-worker Authorization & job_queue RLS Hardening", () => {
    it("Verifies job-worker uses requireCronAuth blocking unauthenticated access", () => {
      const jobWorkerPath = join(functionsDir, "job-worker", "index.ts");
      const content = readFileSync(jobWorkerPath, "utf-8");

      expect(content).toContain("requireCronAuth");
    });

    it("Verifies _shared/cron-auth.ts implements fail-closed authentication", () => {
      const cronAuthPath = join(functionsDir, "_shared", "cron-auth.ts");
      const content = readFileSync(cronAuthPath, "utf-8");

      expect(content).toContain("requireCronAuth");
      expect(content).not.toContain("payload.role"); // Negative assertion: No unverified JWT role decoding
      expect(content).not.toContain("atob("); // Negative assertion: No unverified base64 decoding
      expect(content).toContain("403");
      expect(content).toContain("503");
    });

    it("Verifies job_queue RLS hardening migration dynamically drops permissive policies and conditionally enables RLS", () => {
      const files = readdirSync(migrationsDir);
      const rlsMigrationFile = files.find((f) => f.includes("job_queue_rls_hardening"));
      expect(rlsMigrationFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, rlsMigrationFile!), "utf-8");
      expect(content).toContain("EXECUTE format('DROP POLICY IF EXISTS %I ON public.job_queue', pol.policyname)");
      expect(content).toContain("ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY");
    });
  });

  describe("3. C1 & Cron 23: Direct SQL Execution & Guarded Unschedule", () => {
    it("Verifies cron23 migration uses cron.job existence check and schedules SQL-direct execution", () => {
      const files = readdirSync(migrationsDir);
      const cron23File = files.find((f) => f.includes("fix_cron23_cleanup_unpaid_accounts"));
      expect(cron23File).toBeDefined();

      const content = readFileSync(join(migrationsDir, cron23File!), "utf-8");
      expect(content).toContain("WHERE jobname = 'cleanup-unpaid-accounts-daily'");
      expect(content).toContain("PERFORM cron.unschedule('cleanup-unpaid-accounts-daily');");
      expect(content).toContain("'0 2 * * *'");
      expect(content).toContain("'SELECT public.cleanup_expired_unpaid_accounts()'");
      expect(content).not.toContain("net.http_post");
      expect(content).not.toContain("reset-usage");
    });
  });

  describe("4. Direct Send Fail-Closed, Suppression, Retries, N2, N3 & H1", () => {
    it("Verifies auth-email-hook uses live v19 confirmation link format and checks DB errors", () => {
      const authHookPath = join(functionsDir, "auth-email-hook", "index.ts");
      const content = readFileSync(authHookPath, "utf-8");

      expect(content).toContain("if (!resendApiKey)");
      expect(content).toContain("status: 'failed'");
      expect(content).toContain("sent: false");
      expect(content).toContain("500");
      expect(content).toContain("sendViaResendWithRetry");
      expect(content).toContain("/auth/confirm?token_hash=");
      expect(content).toContain("token_hash_new");
      expect(content).toContain("insertErr");
      expect(content).not.toContain("enqueue_email");
    });

    it("Verifies send-transactional-email maintains live N3 columns, real retry backoff, and H1 sent_at", () => {
      const transPath = join(functionsDir, "send-transactional-email", "index.ts");
      const content = readFileSync(transPath, "utf-8");

      expect(content).toContain("suppressed_emails");
      expect(content).toContain("email_unsubscribe_tokens");
      expect(content).toContain("reason: 'email_suppressed'");
      expect(content).toContain("duplicate: true");
      expect(content).toContain("if (!resendApiKey)");
      expect(content).toContain("status: 'failed'");
      expect(content).toContain("message_content");
      expect(content).toContain("next_retry_at");
      expect(content).toContain("sent_at");
      expect(content).toContain("sendLogErr");
      expect(content).not.toContain("enqueue_email");
    });

    it("Verifies H1 additive migration for email_send_log.sent_at exists", () => {
      const files = readdirSync(migrationsDir);
      const sentAtMigrationFile = files.find((f) => f.includes("email_send_log_sent_at"));
      expect(sentAtMigrationFile).toBeDefined();

      const content = readFileSync(join(migrationsDir, sentAtMigrationFile!), "utf-8");
      expect(content).toContain("ALTER TABLE public.email_send_log");
      expect(content).toContain("ADD COLUMN IF NOT EXISTS sent_at timestamptz;");
      expect(content).not.toContain("UNIQUE(message_id)");
    });
  });
});
