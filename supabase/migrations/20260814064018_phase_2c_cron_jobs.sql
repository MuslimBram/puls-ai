
-- PHASE 2C — CRON JOBS via pg_cron + pg_net
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- All cron functions use verify_jwt=false + requireCronAuth (x-cron-secret header).
-- CRON_SECRET is set in Edge Function secrets — referenced as app.settings.cron_secret.
-- Per cron.schedule docs, the command string must be a SQL statement, not a block.

-- 1. Health monitor every 5 min
SELECT cron.schedule(
  'health-monitor-5min', '*/5 * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/health-monitor',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 2. Telegram poll every minute
SELECT cron.schedule(
  'telegram-poll-1min', '* * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/telegram-poll',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 3. Process drip emails every hour
SELECT cron.schedule(
  'process-drip-emails-hourly', '0 * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/process-drip-emails',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 4. Email poll every 5 min
SELECT cron.schedule(
  'email-poll-5min', '*/5 * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/email-poll',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 5. Send transactional email every minute (processes broadcast queue)
SELECT cron.schedule(
  'send-transactional-email-1min', '* * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/send-transactional-email',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 6. Score and rank leads every 15 min
SELECT cron.schedule(
  'score-leads-15min', '*/15 * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/score-and-rank-leads',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 7. SLA breach checker every 5 min
SELECT cron.schedule(
  'sla-breach-5min', '*/5 * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/sla-breach-checker',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 8. Journey engine every 5 min
SELECT cron.schedule(
  'journey-engine-5min', '*/5 * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/journey-engine',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 9. Churn risk daily at 03:00 UTC
SELECT cron.schedule(
  'churn-risk-daily', '0 3 * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/churn-risk-detect',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 10. Sales sequence engine every 15 min
SELECT cron.schedule(
  'sales-sequence-15min', '*/15 * * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/sales-sequence-engine',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);

-- 11. Cleanup unpaid accounts daily at 02:00 UTC
SELECT cron.schedule(
  'cleanup-unpaid-accounts-daily', '0 2 * * *',
  $$SELECT net.http_post('https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/cleanup-unpaid-accounts',
    '{"source":"pg_cron"}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-cron-secret',
      current_setting('app.settings.cron_secret',true)))$$
);
;
