
SELECT net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/ai-router-tests',
  body    := '{}'::jsonb,
  params  := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret()),
  timeout_milliseconds := 60000
) AS tests_id;
;
