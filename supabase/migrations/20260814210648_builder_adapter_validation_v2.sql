
-- GET registry (no auth needed for registry endpoint)
SELECT net.http_get(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/builder-adapter-router',
  params  := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json')
) AS registry_id;

-- POST: lovable — disconnected state test (internal path via INTERNAL_WEBHOOK_SECRET from Edge Function)
-- We'll call via a migration without the secret header — expect 401 (auth validated)
SELECT net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/builder-adapter-router',
  body    := '{"adapter_key":"lovable_mcp","dry_run":true,"idempotency_key":"test:lovable:validation:001"}'::jsonb,
  params  := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json')
) AS lovable_noauth_id;

-- POST: unknown adapter → expect 400 fail-closed
SELECT net.http_post(
  url     := 'https://wlvlgghqwwhhqaqqopml.supabase.co/functions/v1/builder-adapter-router',
  body    := '{"adapter_key":"gpt_builder_FAKE","dry_run":true}'::jsonb,
  params  := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer fake')
) AS unknown_adapter_id;
;
