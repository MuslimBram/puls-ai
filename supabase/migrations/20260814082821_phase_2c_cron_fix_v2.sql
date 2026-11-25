
-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 2C CRON FIX v2
-- Root cause: net.http_post positional arg 3 = params (not headers)
-- Fix: use named args; retrieve CRON_SECRET via a SECURITY DEFINER helper
--
-- CRON_SECRET must be inserted into internal_config by the platform owner:
--   INSERT INTO internal_config (key,value) VALUES ('cron_secret','<your_cron_secret>');
-- This is the same secret set in Supabase Edge Function secrets as CRON_SECRET.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Secure config table (service-role only; no anon RLS)
CREATE TABLE IF NOT EXISTS internal_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Only service role can read/write
ALTER TABLE internal_config ENABLE ROW LEVEL SECURITY;
-- No RLS policies = no direct user access; only service role / security definer functions

-- 2. SECURITY DEFINER helper — safe wrapper for pg_cron commands
CREATE OR REPLACE FUNCTION get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT value FROM internal_config WHERE key = 'cron_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_cron_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_cron_secret() TO postgres;  -- pg_cron runs as postgres

-- 3. Drop all existing cron jobs (they have wrong header placement)
SELECT cron.unschedule(jobname) FROM cron.job;

-- 4. Recreate ALL cron jobs with CORRECT named arguments
-- Pattern:
--   net.http_post(
--     url     := 'https://.../.../function-name',
--     body    := '{"source":"pg_cron"}'::jsonb,
--     params  := '{}'::jsonb,           ← explicit empty params (not headers)
--     headers := jsonb_build_object(    ← NAMED arg = headers
--       'Content-Type', 'application/json',
--       'x-cron-secret', get_cron_secret()
--     )
--   )

-- 4a. Health monitor — every 5 min
SELECT cron.schedule(
  'health-monitor-5min', '*/5 * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/health-monitor',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4b. Telegram poll — every minute
SELECT cron.schedule(
  'telegram-poll-1min', '* * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/telegram-poll',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4c. Process drip emails — every hour
SELECT cron.schedule(
  'process-drip-emails-hourly', '0 * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/process-drip-emails',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4d. Email poll — every 5 min
SELECT cron.schedule(
  'email-poll-5min', '*/5 * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/email-poll',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4e. Send transactional email — every minute
SELECT cron.schedule(
  'send-transactional-email-1min', '* * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/send-transactional-email',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4f. Score and rank leads — every 15 min
SELECT cron.schedule(
  'score-leads-15min', '*/15 * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/score-and-rank-leads',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4g. SLA breach checker — every 5 min
SELECT cron.schedule(
  'sla-breach-5min', '*/5 * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/sla-breach-checker',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4h. Journey engine — every 5 min
SELECT cron.schedule(
  'journey-engine-5min', '*/5 * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/journey-engine',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4i. Churn risk detect — daily at 03:00 UTC
SELECT cron.schedule(
  'churn-risk-daily', '0 3 * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/churn-risk-detect',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4j. Sales sequence engine — every 15 min
SELECT cron.schedule(
  'sales-sequence-15min', '*/15 * * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/sales-sequence-engine',
      body    := '{"source":"pg_cron"}'::jsonb,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 4k. Cleanup unpaid accounts — daily at 02:00 UTC
SELECT cron.schedule(
  'cleanup-unpaid-accounts-daily', '0 2 * * *',
  $$SELECT net.http_post(
      url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/cleanup-unpaid-accounts',
      body    := '{"source":"pg_cron"}'::jobson,
      params  := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret())
    )$$
);

-- 5. Verify result
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
;
