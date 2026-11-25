
-- Direct pg_net call to builder-adapter-router with real workspace_id
-- to isolate where the 500 occurs
WITH ws AS (
  SELECT id AS workspace_id FROM workspaces LIMIT 1
)
SELECT net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/builder-adapter-router',
  body    := jsonb_build_object(
    'adapter_key',    'emergent_mcp',
    'action',         'create_job',
    'idempotency_key','test:direct:smoke:1',
    'workspace_id',   (SELECT workspace_id FROM ws)
  ),
  params  := '{}'::jsonb,
  headers := jsonb_build_object(
    'Content-Type',    'application/json',
    'Authorization',   'Bearer ' || current_setting('app.settings.service_role_key', true),
    'x-internal-secret', current_setting('app.settings.internal_webhook_secret', true)
  ),
  timeout_milliseconds := 30000
) AS direct_id;
;
