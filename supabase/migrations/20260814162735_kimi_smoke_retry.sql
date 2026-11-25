
-- Retry smoke test — rate limits typically 60s window
SELECT net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/kimi-smoke-test',
  body    := '{}'::jsonb,
  params  := '{}'::jsonb,
  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'x-cron-secret', get_cron_secret()
  )
) AS retry_request_id;
;
