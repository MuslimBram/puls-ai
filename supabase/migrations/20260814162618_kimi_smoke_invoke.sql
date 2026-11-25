
-- Invoke kimi-smoke-test from within Supabase infrastructure
-- get_cron_secret() accessible to postgres role in migration context
SELECT net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/kimi-smoke-test',
  body    := '{}'::jsonb,
  params  := '{}'::jsonb,
  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'x-cron-secret', get_cron_secret()
  )
) AS smoke_request_id;
;
