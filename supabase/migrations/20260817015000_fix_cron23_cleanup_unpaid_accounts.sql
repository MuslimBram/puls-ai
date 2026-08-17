-- Migration: 20260817015000_fix_cron23_cleanup_unpaid_accounts.sql
-- Fix Cron Job 23: Direct SQL call to public.cleanup_expired_unpaid_accounts()
-- Jobname: cleanup-unpaid-accounts-daily
-- Schedule: 0 2 * * * (Daily at 02:00 AM)
-- Zero HTTP endpoint / Edge Function dependency.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'cleanup-unpaid-accounts-daily'
    ) THEN
      PERFORM cron.unschedule('cleanup-unpaid-accounts-daily');
    END IF;

    PERFORM cron.schedule(
      'cleanup-unpaid-accounts-daily',
      '0 2 * * *',
      'SELECT public.cleanup_expired_unpaid_accounts()'
    );
  END IF;
END $$;
