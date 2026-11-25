
-- ── Fix 1: cleanup-unpaid-accounts-daily — ::jobson → ::jsonb ───────────────
-- Drop the bad job, recreate with correct cast. No duplicate (unschedule first).
SELECT cron.unschedule('cleanup-unpaid-accounts-daily');

SELECT cron.schedule(
  'cleanup-unpaid-accounts-daily',
  '0 2 * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/cleanup-unpaid-accounts',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- Verify: exactly 1 cleanup job, no ::jobson typo
SELECT COUNT(*) AS cleanup_job_count,
       bool_or(command LIKE '%::jobson%') AS has_typo,
       bool_or(command LIKE '%::jsonb%') AS has_jsonb
FROM cron.job
WHERE jobname = 'cleanup-unpaid-accounts-daily';
;
