
SELECT net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/batch-provider-smoke',
  body    := '{}'::jsonb,
  params  := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',get_cron_secret()),
  timeout_milliseconds := 120000
) AS batch_smoke_id;
;
