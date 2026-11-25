
WITH ws AS (SELECT id FROM workspaces LIMIT 1)
SELECT net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/bar-step-debug',
  body    := jsonb_build_object('adapter_key','emergent_mcp','action','create_job','idempotency_key','test:stepdbg:1','workspace_id',(SELECT id FROM ws)),
  params  := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',get_cron_secret()),
  timeout_milliseconds := 30000
) AS step_debug_id;
;
